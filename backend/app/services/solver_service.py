from __future__ import annotations

from typing import Dict, List, Tuple, Optional
import logging

import pandas as pd
from ortools.sat.python import cp_model
from sqlmodel import Session, select

from stundenplan_regeln import add_constraints

solver_logger = logging.getLogger("stundenplan.solver")
if not solver_logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(levelname)s %(name)s: %(message)s")
    handler.setFormatter(formatter)
    solver_logger.addHandler(handler)
solver_logger.setLevel(logging.DEBUG)
solver_logger.propagate = True
from sqlalchemy import text

from ..models import Requirement, RequirementParticipationEnum, Subject, Teacher, Class, Room
from ..utils import TAGE


def _compute_score(model: cp_model.CpModel, solver: cp_model.CpSolver) -> float:
    # Kompatibler Score wie in Streamlit: 1000/(1+penalty)
    has_obj = hasattr(model, "HasObjective") and getattr(model, "HasObjective")
    try:
        penalty = solver.ObjectiveValue()
    except Exception:
        penalty = 0.0
    return 1000.0 / (1.0 + max(0.0, penalty))


def _rules_to_dict(rule_profile: Dict[str, int | bool] | None) -> Dict[str, int | bool]:
    if not rule_profile:
        return {}
    return dict(rule_profile)


def fetch_requirements_dataframe(session: Session, version_id: Optional[int] = None) -> Tuple[pd.DataFrame, List[int], List[str], List[str], Dict[int, Dict[str, bool]]]:
    _ensure_solver_schema(session)
    # Holt Requirements + Namen und baut das Erwartungs-DF
    stmt = select(Requirement)
    if version_id is not None:
        stmt = stmt.where(Requirement.version_id == version_id)
    reqs = session.exec(stmt).all()
    if not reqs:
        return pd.DataFrame(), [], [], []

    # Name-Lookups
    subject_rows = session.exec(select(Subject)).all()
    room_rows = session.exec(select(Room)).all()
    teacher_rows = session.exec(select(Teacher)).all()
    subjects = {s.id: s.name for s in subject_rows}
    subject_room = {s.id: s.required_room_id for s in subject_rows}
    rooms = {r.id: r.name for r in room_rows}
    subject_band = {s.id: bool(s.is_bandfach) for s in subject_rows}
    subject_ag = {s.id: bool(s.is_ag_foerder) for s in subject_rows}
    subject_alias = {s.id: s.alias_subject_id for s in subject_rows}
    teachers = {t.id: t.name for t in teacher_rows}
    teacher_workdays = {
        t.id: {
            "Mo": bool(t.work_mo),
            "Di": bool(t.work_di),
            "Mi": bool(t.work_mi),
            "Do": bool(t.work_do),
            "Fr": bool(t.work_fr),
        }
        for t in teacher_rows
    }
    classes = {c.id: c.name for c in session.exec(select(Class)).all()}

    def _canonical_subject_id(subject_id: int) -> int:
        seen = set()
        current = subject_id
        while subject_alias.get(current):
            if current in seen:
                break
            seen.add(current)
            alias_id = subject_alias.get(current)
            if alias_id is None:
                break
            current = alias_id
        return current

    canonical_names = {sid: subjects.get(_canonical_subject_id(sid), subjects.get(sid, str(sid))) for sid in subjects.keys()}

    records = []
    for r in reqs:
        room_id = subject_room.get(r.subject_id)
        room_name = rooms.get(room_id) if room_id else None
        is_bandfach = subject_band.get(r.subject_id, False)
        participation = r.participation.value if isinstance(r.participation, RequirementParticipationEnum) else RequirementParticipationEnum.curriculum.value
        canonical_id = _canonical_subject_id(r.subject_id)
        record = {
            "Fach": subjects.get(r.subject_id, str(r.subject_id)),
            "Klasse": classes.get(r.class_id, str(r.class_id)),
            "Lehrer": teachers.get(r.teacher_id, str(r.teacher_id)),
            "Wochenstunden": int(r.wochenstunden),
            "Doppelstunde": r.doppelstunde.value,
            "Nachmittag": r.nachmittag.value,
            "RoomID": room_id,
            "Room": room_name,
            "Participation": participation,
            "CanonicalSubjectId": canonical_id,
            "CanonicalSubject": canonical_names.get(r.subject_id, subjects.get(r.subject_id, str(r.subject_id))),
            "TeacherId": r.teacher_id,
        }
        record["Bandfach"] = bool(is_bandfach)
        record["AGFoerder"] = bool(subject_ag.get(r.subject_id, False))
        records.append(record)

    df = pd.DataFrame.from_records(records)
    FACH_ID = list(df.index)
    KLASSEN = [str(x) for x in sorted(df["Klasse"].unique(), key=lambda v: int(str(v)) if str(v).isdigit() else str(v))]
    LEHRER = sorted(df["Lehrer"].astype(str).unique())
    return df, FACH_ID, KLASSEN, LEHRER, teacher_workdays


def _ensure_solver_schema(session: Session) -> None:
    info = session.exec(text("PRAGMA table_info(subject)"))
    columns = {row[1] for row in info}
    if "alias_subject_id" not in columns:
        session.exec(text("ALTER TABLE subject ADD COLUMN alias_subject_id INTEGER"))
        session.commit()

    info_req = session.exec(text("PRAGMA table_info(requirement)"))
    columns_req = {row[1] for row in info_req}
    if "participation" not in columns_req:
        session.exec(text("ALTER TABLE requirement ADD COLUMN participation TEXT DEFAULT 'curriculum'"))
        session.commit()


def solve_best_plan(
    df: pd.DataFrame,
    FACH_ID: List[int],
    KLASSEN: List[str],
    LEHRER: List[str],
    regeln: Dict[str, int | bool],
    teacher_workdays: Optional[Dict[int, Dict[str, bool]]] = None,
    room_plan: Optional[Dict[int, Dict[str, List[bool]]]] = None,
    fixed_slots: Optional[Dict[int, List[Tuple[str, int]]]] = None,
    flexible_groups: Optional[List[Dict[str, object]]] = None,
    class_windows: Optional[Dict[str, Dict[str, List[bool]]]] = None,
    multi_start: bool = True,
    max_attempts: int = 10,
    patience: int = 3,
    time_per_attempt: float = 5.0,
    randomize_search: bool = True,
    base_seed: int = 42,
    seed_step: int = 17,
    use_value_hints: bool = True,
) -> Tuple[int, cp_model.CpSolver, cp_model.CpModel, Dict[Tuple[int, str, int], cp_model.IntVar], float]:
    # Adapter: stark an stundenplan_app angelehnt, aber ohne UI

    def add_value_hints_evenly(model: cp_model.CpModel, plan: Dict, slots_per_day: int = 6, seed: int = 0) -> None:
        import random

        rnd = random.Random(seed)
        hinted = set()
        for fid in FACH_ID:
            need = int(df.loc[fid, "Wochenstunden"])
            if need <= 0:
                continue
            candidates = [(tag, s) for tag in TAGE for s in range(slots_per_day)]
            rnd.shuffle(candidates)
            for (tag, s) in candidates:
                key = (fid, tag, s)
                if key in hinted:
                    continue
                model.AddHint(plan[(fid, tag, s)], 1)
                hinted.add(key)
                need -= 1
                if need <= 0:
                    break

    def solve_once(seed: int):
        model = cp_model.CpModel()
        plan = {(fid, tag, std): model.NewBoolVar(f"plan_{fid}_{tag}_{std}") for fid in FACH_ID for tag in TAGE for std in range(8)}
        add_constraints(
            model,
            plan,
            df,
            FACH_ID,
            TAGE,
            KLASSEN,
            LEHRER,
            regeln,
            teacher_workdays=teacher_workdays,
            room_plan=room_plan,
            fixed_slots=fixed_slots,
            flexible_groups=flexible_groups,
            class_windows=class_windows,
        )

        if use_value_hints:
            add_value_hints_evenly(model, plan, slots_per_day=6, seed=seed)

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = float(time_per_attempt)
        solver.parameters.num_search_workers = 8
        solver.parameters.random_seed = int(seed)
        solver.parameters.randomize_search = bool(randomize_search)

        status = solver.Solve(model)
        return status, solver, model, plan

    best_pack = None
    best_score = None
    no_improve = 0
    total_attempts = int(max_attempts) if multi_start else 1

    for attempt_idx in range(total_attempts):
        seed = int(base_seed + attempt_idx * seed_step)
        status, solver, model, plan = solve_once(seed)
        solver_logger.debug(
            "solve_best_plan attempt=%s seed=%s status=%s objective=%s",
            attempt_idx,
            seed,
            status,
            getattr(solver, "ObjectiveValue", lambda: None)(),
        )
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            no_improve += 1
        else:
            score = _compute_score(model, solver)
            if (best_score is None) or (score > best_score):
                best_score = score
                best_pack = (status, solver, model, plan)
                no_improve = 0
            else:
                no_improve += 1
        if multi_start and no_improve >= int(patience):
            break

    if best_pack is None:
        solver_logger.warning(
            "solve_best_plan exhausted attempts without feasible solution | attempts=%s",
            total_attempts,
        )
        return cp_model.INFEASIBLE, cp_model.CpSolver(), cp_model.CpModel(), {}, 0.0

    status, solver, model, plan = best_pack
    solver_logger.debug(
        "solve_best_plan best status=%s score=%.2f",
        status,
        float(best_score or 0.0),
    )
    return status, solver, model, plan, float(best_score or 0.0)
