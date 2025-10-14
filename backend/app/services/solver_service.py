from __future__ import annotations

from typing import Dict, List, Tuple, Optional

import pandas as pd
from ortools.sat.python import cp_model
from sqlmodel import Session, select

from stundenplan_regeln import add_constraints
from ..models import Requirement, Subject, Teacher, Class, Room
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


def fetch_requirements_dataframe(session: Session, version_id: Optional[int] = None) -> Tuple[pd.DataFrame, List[int], List[str], List[str]]:
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
    subjects = {s.id: s.name for s in subject_rows}
    subject_room = {s.id: s.required_room_id for s in subject_rows}
    rooms = {r.id: r.name for r in room_rows}
    subject_band = {s.id: bool(s.is_bandfach) for s in subject_rows}
    subject_ag = {s.id: bool(s.is_ag_foerder) for s in subject_rows}
    teachers = {t.id: t.name for t in session.exec(select(Teacher)).all()}
    classes = {c.id: c.name for c in session.exec(select(Class)).all()}

    records = []
    for r in reqs:
        room_id = subject_room.get(r.subject_id)
        room_name = rooms.get(room_id) if room_id else None
        is_bandfach = subject_band.get(r.subject_id, False)
        record = {
            "Fach": subjects.get(r.subject_id, str(r.subject_id)),
            "Klasse": classes.get(r.class_id, str(r.class_id)),
            "Lehrer": teachers.get(r.teacher_id, str(r.teacher_id)),
            "Wochenstunden": int(r.wochenstunden),
            "Doppelstunde": r.doppelstunde.value,
            "Nachmittag": r.nachmittag.value,
            "RoomID": room_id,
            "Room": room_name,
        }
        record["Bandfach"] = bool(is_bandfach)
        record["AGFoerder"] = bool(subject_ag.get(r.subject_id, False))
        records.append(record)

    df = pd.DataFrame.from_records(records)
    FACH_ID = list(df.index)
    KLASSEN = [str(x) for x in sorted(df["Klasse"].unique(), key=lambda v: int(str(v)) if str(v).isdigit() else str(v))]
    LEHRER = sorted(df["Lehrer"].astype(str).unique())
    return df, FACH_ID, KLASSEN, LEHRER


def solve_best_plan(
    df: pd.DataFrame,
    FACH_ID: List[int],
    KLASSEN: List[str],
    LEHRER: List[str],
    regeln: Dict[str, int | bool],
    room_plan: Optional[Dict[int, Dict[str, List[bool]]]] = None,
    fixed_slots: Optional[Dict[int, List[Tuple[str, int]]]] = None,
    flexible_groups: Optional[List[Dict[str, object]]] = None,
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
        for fid in FACH_ID:
            for tag in TAGE:
                for std in range(8):
                    model.AddHint(plan[(fid, tag, std)], 0)
        for fid in FACH_ID:
            need = int(df.loc[fid, "Wochenstunden"])
            candidates = [(tag, s) for tag in TAGE for s in range(slots_per_day)]
            rnd.shuffle(candidates)
            for (tag, s) in candidates[:need]:
                model.AddHint(plan[(fid, tag, s)], 1)

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
            room_plan=room_plan,
            fixed_slots=fixed_slots,
            flexible_groups=flexible_groups,
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
        # return infeasible choice
        return cp_model.INFEASIBLE, cp_model.CpSolver(), cp_model.CpModel(), {}, 0.0

    status, solver, model, plan = best_pack
    return status, solver, model, plan, float(best_score or 0.0)
