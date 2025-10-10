from __future__ import annotations

from typing import List
import json

from fastapi import APIRouter, Depends, HTTPException
from ortools.sat.python import cp_model
from sqlmodel import Session, select

from ..database import get_session
from ..models import Class, Plan, PlanSlot, RuleProfile, Subject, Teacher, BasisPlan
from ..schemas import GenerateRequest, GenerateResponse, PlanSlotOut
from ..services.solver_service import (
    _rules_to_dict,
    fetch_requirements_dataframe,
    solve_best_plan,
)
from ..utils import TAGE


router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("/rules")
def list_rules() -> dict:
    """Returns available rule switches and soft-weights with defaults and descriptions.
    Kept in sync with stundenplan_regeln.add_constraints expectations.
    """
    return {
        "bools": [
            {"key": "stundenbegrenzung", "label": "Tageslimit (Mo–Do 6, Fr 5)", "default": True},
            {"key": "keine_hohlstunden", "label": "Hohlstunden minimieren (Soft)", "default": True},
            {"key": "keine_hohlstunden_hard", "label": "Keine Hohlstunden (Hard)", "default": False},
            {"key": "nachmittag_regel", "label": "Nachmittag nur Di (globale Regel)", "default": True},
            {"key": "klassenlehrerstunde_fix", "label": "KL-Stunde: Fr 5. fix", "default": True},
            {"key": "doppelstundenregel", "label": "Doppelstunden-Regel (max 2 in Folge)", "default": True},
            {"key": "einzelstunde_nur_rand", "label": "Einzelstunde nur Rand (bei DS=muss)", "default": True},
            {"key": "leseband_parallel", "label": "Leseband parallel", "default": True},
            {"key": "kuba_parallel", "label": "Kuba parallel", "default": True},
            {"key": "gleichverteilung", "label": "Gleichverteilung über Woche (Soft)", "default": True},
            {"key": "mittagsschule_vormittag", "label": "Vormittagsregel Mittagsschule (4/≥5)", "default": True},
        ],
        "weights": [
            {"key": "W_GAPS_START", "label": "Gewicht Startlücke", "default": 2, "min": 0, "max": 50},
            {"key": "W_GAPS_INSIDE", "label": "Gewicht Hohlstunden (innen)", "default": 3, "min": 0, "max": 50},
            {"key": "W_EVEN_DIST", "label": "Gewicht Gleichverteilung", "default": 1, "min": 0, "max": 50},
            {"key": "W_EINZEL_KANN", "label": "Gewicht Einzelstunden-Penalty (DS=kann)", "default": 5, "min": 0, "max": 50},
        ]
    }


@router.get("/analyze")
def analyze_inputs(session: Session = Depends(get_session)) -> dict:
    """Returns a lightweight analysis of current data for planning: counts per class/subject,
    teacher loads vs deputat, and flags presence for DS/Nachmittag in requirements.
    """
    df, FACH_ID, KLASSEN, LEHRER = fetch_requirements_dataframe(session)
    if df.empty:
        return {"ok": True, "empty": True}

    # Per class: total hours
    per_class = (
        df.groupby(df["Klasse"].astype(str))[["Wochenstunden"]].sum().reset_index().rename(columns={"Klasse":"klasse","Wochenstunden":"stunden"})
    )
    # Per subject: per class hours
    per_class_subject = (
        df.groupby([df["Klasse"].astype(str), df["Fach"].astype(str)])[["Wochenstunden"]]
          .sum().reset_index().rename(columns={"Klasse":"klasse","Fach":"fach","Wochenstunden":"stunden"})
    )
    # Teacher loads
    per_teacher = (
        df.groupby(df["Lehrer"].astype(str))[["Wochenstunden"]].sum().reset_index().rename(columns={"Lehrer":"lehrer","Wochenstunden":"stunden"})
    )
    # Deputat and metadata from DB
    trows = session.exec(select(Teacher)).all()
    deputat = {t.name: (t.deputat or t.deputat_soll) for t in trows}
    teacher_info = [
        {
            "lehrer": row["lehrer"],
            "stunden": int(row["stunden"]),
            "deputat": int(deputat.get(row["lehrer"], 0) or 0),
        }
        for _, row in per_teacher.iterrows()
    ]
    # Flags distribution in requirements
    def _safe_col(name: str):
        return df[name] if name in df.columns else None
    ds_counts = None
    if _safe_col("Doppelstunde") is not None:
        ds_counts = df["Doppelstunde"].value_counts().to_dict()
    nm_counts = None
    if _safe_col("Nachmittag") is not None:
        nm_counts = df["Nachmittag"].value_counts().to_dict()

    return {
        "ok": True,
        "classes": per_class.to_dict(orient="records"),
        "class_subjects": per_class_subject.to_dict(orient="records"),
        "teachers": teacher_info,
        "flags": {"Doppelstunde": ds_counts, "Nachmittag": nm_counts},
        "rules": list_rules(),
    }

@router.post("/generate", response_model=GenerateResponse)
def generate_plan(req: GenerateRequest, session: Session = Depends(get_session)) -> GenerateResponse:
    # Daten laden
    df, FACH_ID, KLASSEN, LEHRER = fetch_requirements_dataframe(session)
    if df.empty:
        raise HTTPException(status_code=400, detail="Keine Requirements in der DB – bitte zuerst Bedarf anlegen.")

    # Regelprofil laden oder Defaults
    rules: dict = {}
    if req.rule_profile_id is not None:
        prof = session.get(RuleProfile, req.rule_profile_id)
        if not prof:
            raise HTTPException(status_code=404, detail="Regelprofil nicht gefunden")
        rules = _rules_to_dict(prof.dict())

    if req.override_rules:
        rules.update(req.override_rules)

    # Basisplan-Raumverfügbarkeit laden (optional)
    room_plan: dict[int, dict[str, list[bool]]] = {}
    basis_row = session.exec(select(BasisPlan)).first()
    if basis_row and basis_row.data:
        try:
            basis_payload = json.loads(basis_row.data)
        except json.JSONDecodeError:
            basis_payload = {}
        rooms_cfg = basis_payload.get("rooms") or {}
        if isinstance(rooms_cfg, dict):
            room_items = rooms_cfg.items()
        elif isinstance(rooms_cfg, list):
            room_items = [(cfg.get("room_id") or idx, cfg) for idx, cfg in enumerate(rooms_cfg)]
        else:
            room_items = []
        for key, cfg in room_items:
            if not isinstance(cfg, dict):
                continue
            rid = cfg.get("room_id")
            if rid is None:
                try:
                    rid = int(key)
                except (TypeError, ValueError):
                    continue
            try:
                rid_int = int(rid)
            except (TypeError, ValueError):
                continue
            allowed_cfg = cfg.get("allowed") or {}
            normalized: dict[str, list[bool]] = {}
            for tag in TAGE:
                slots = allowed_cfg.get(tag)
                if not slots:
                    normalized[tag] = [True] * 8
                else:
                    normalized[tag] = [
                        bool(slots[i]) if i < len(slots) else True
                        for i in range(8)
                    ]
            room_plan[rid_int] = normalized

    # Solver laufen lassen
    status, solver, model, plan, best_score = solve_best_plan(
        df=df,
        FACH_ID=FACH_ID,
        KLASSEN=KLASSEN,
        LEHRER=LEHRER,
        regeln=rules,
        room_plan=room_plan or None,
        multi_start=req.params.multi_start,
        max_attempts=req.params.max_attempts,
        patience=req.params.patience,
        time_per_attempt=req.params.time_per_attempt,
        randomize_search=req.params.randomize_search,
        base_seed=req.params.base_seed,
        seed_step=req.params.seed_step,
        use_value_hints=req.params.use_value_hints,
    )

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise HTTPException(status_code=422, detail="Keine Lösung gefunden.")

    # Plan speichern
    plan_row = Plan(
        name=req.name,
        rule_profile_id=req.rule_profile_id,
        seed=req.params.base_seed,
        status={cp_model.OPTIMAL: "OPTIMAL", cp_model.FEASIBLE: "FEASIBLE"}.get(status, str(status)),
        score=best_score,
        objective_value=solver.ObjectiveValue() if hasattr(solver, "ObjectiveValue") else None,
    )
    session.add(plan_row)
    session.commit()
    session.refresh(plan_row)

    # Helpers für IDs
    subjects_by_name = {s.name: s.id for s in session.exec(select(Subject)).all()}
    teachers_by_name = {t.name: t.id for t in session.exec(select(Teacher)).all()}
    classes_by_name = {c.name: c.id for c in session.exec(select(Class)).all()}

    # Slots sammeln und speichern
    slots_out: List[PlanSlotOut] = []
    for fid in FACH_ID:
        fach = str(df.loc[fid, "Fach"])  # Namen aus DF
        klasse = str(df.loc[fid, "Klasse"])  # Name
        lehrer = str(df.loc[fid, "Lehrer"])  # Name

        subject_id = subjects_by_name.get(fach)
        teacher_id = teachers_by_name.get(lehrer)
        class_id = classes_by_name.get(klasse)
        if subject_id is None or teacher_id is None or class_id is None:
            # Sicherheitsnetz – sollte nicht passieren, weil Requirements auf diesen Tabellen basieren
            continue

        for tag in TAGE:
            for std in range(8):
                if solver.Value(plan[(fid, tag, std)]) == 1:
                    slot = PlanSlot(
                        plan_id=plan_row.id,
                        class_id=class_id,
                        tag=tag,
                        stunde=std + 1,
                        subject_id=subject_id,
                        teacher_id=teacher_id,
                    )
                    session.add(slot)
                    slots_out.append(
                        PlanSlotOut(
                            class_id=class_id,
                            tag=tag,
                            stunde=std + 1,
                            subject_id=subject_id,
                            teacher_id=teacher_id,
                        )
                    )

    session.commit()

    return GenerateResponse(
        plan_id=plan_row.id,
        status=plan_row.status,
        score=plan_row.score,
        objective_value=plan_row.objective_value,
        slots=slots_out,
    )
