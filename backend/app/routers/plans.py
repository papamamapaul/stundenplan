from __future__ import annotations

from typing import List, Dict, Tuple, Optional
import json
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from ortools.sat.python import cp_model
from sqlmodel import Session, select

from ..database import get_session
from ..models import Class, Plan, PlanSlot, RuleProfile, Subject, Teacher, BasisPlan
from ..schemas import GenerateRequest, GenerateResponse, PlanSlotOut, PlanUpdateRequest
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
def analyze_inputs(version_id: Optional[int] = None, session: Session = Depends(get_session)) -> dict:
    """Returns a lightweight analysis of current data for planning: counts per class/subject,
    teacher loads vs deputat, and flags presence for DS/Nachmittag in requirements.
    """
    df, FACH_ID, KLASSEN, LEHRER = fetch_requirements_dataframe(session, version_id=version_id)
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
    version_id = req.version_id
    # Daten laden
    df, FACH_ID, KLASSEN, LEHRER = fetch_requirements_dataframe(session, version_id=version_id)
    if df.empty:
        msg = "Keine Requirements in der DB – bitte zuerst Bedarf anlegen."
        if version_id is not None:
            msg = f"Keine Requirements für Version #{version_id} gefunden – bitte zuerst Bedarf anlegen."
        raise HTTPException(status_code=400, detail=msg)

    subject_rows = session.exec(select(Subject)).all()
    class_rows = session.exec(select(Class)).all()
    teacher_rows = session.exec(select(Teacher)).all()

    subject_id_to_name = {s.id: s.name for s in subject_rows}
    subjects_by_name = {s.name: s.id for s in subject_rows}
    class_id_to_name = {c.id: c.name for c in class_rows}
    classes_by_name = {c.name: c.id for c in class_rows}
    teachers_by_name = {t.name: t.id for t in teacher_rows}

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
    basis_payload: Dict[str, object] = {}
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

    DAY_KEY_TO_TAG = {
        "mon": "Mo",
        "tue": "Di",
        "wed": "Mi",
        "thu": "Do",
        "fri": "Fr",
    }

    fixed_slot_map: Dict[int, List[Tuple[str, int]]] = {}
    flexible_groups: List[Dict[str, object]] = []
    basis_errors: set[str] = set()

    fid_hours = {fid: int(df.loc[fid, "Wochenstunden"]) for fid in FACH_ID}
    fid_usage = defaultdict(int)
    class_subject_fids: Dict[Tuple[str, str], List[int]] = defaultdict(list)
    for fid in FACH_ID:
        key = (str(df.loc[fid, "Klasse"]), str(df.loc[fid, "Fach"]))
        class_subject_fids[key].append(fid)

    def pick_fid(key: Tuple[str, str]) -> int | None:
        fids = class_subject_fids.get(key)
        if not fids:
            return None
        for fid in fids:
            if fid_usage[fid] < fid_hours[fid]:
                fid_usage[fid] += 1
                return fid
        return None

    fixed_cfg = basis_payload.get("fixed") or {}
    if isinstance(fixed_cfg, dict):
        for class_key, entries in fixed_cfg.items():
            try:
                class_id_int = int(class_key)
            except (TypeError, ValueError):
                continue
            class_name = class_id_to_name.get(class_id_int)
            if not class_name:
                continue
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                subject_id = entry.get("subjectId") or entry.get("subject_id")
                day_key = entry.get("day")
                slot_index = entry.get("slot")
                if subject_id is None or day_key not in DAY_KEY_TO_TAG or slot_index is None:
                    continue
                subject_name = subject_id_to_name.get(int(subject_id))
                if not subject_name:
                    continue
                solver_day = DAY_KEY_TO_TAG[day_key]
                try:
                    slot_int = int(slot_index)
                except (TypeError, ValueError):
                    continue
                if slot_int < 0 or slot_int >= 8:
                    continue
                key = (class_name, subject_name)
                fid = pick_fid(key)
                if fid is None:
                    basis_errors.add(f"Zu viele feste Slots für {class_name} / {subject_name}.")
                    continue
                fixed_slot_map.setdefault(fid, []).append((solver_day, slot_int))

    flex_cfg = basis_payload.get("flexible") or {}
    if isinstance(flex_cfg, dict):
        for class_key, groups in flex_cfg.items():
            try:
                class_id_int = int(class_key)
            except (TypeError, ValueError):
                continue
            class_name = class_id_to_name.get(class_id_int)
            if not class_name:
                continue
            if not isinstance(groups, list):
                continue
            for group in groups:
                if not isinstance(group, dict):
                    continue
                subject_id = group.get("subjectId") or group.get("subject_id")
                if subject_id is None:
                    continue
                subject_name = subject_id_to_name.get(int(subject_id))
                if not subject_name:
                    continue
                option_set = set()
                for slot in group.get("slots") or []:
                    if not isinstance(slot, dict):
                        continue
                    day_key = slot.get("day")
                    solver_day = DAY_KEY_TO_TAG.get(day_key or "")
                    if solver_day is None:
                        continue
                    try:
                        slot_int = int(slot.get("slot"))
                    except (TypeError, ValueError):
                        continue
                    if slot_int < 0 or slot_int >= 8:
                        continue
                    option_set.add((solver_day, slot_int))
                if not option_set:
                    continue
                key = (class_name, subject_name)
                fid = pick_fid(key)
                if fid is None:
                    basis_errors.add(f"Zu viele Optionen für {class_name} / {subject_name}.")
                    continue
                flexible_groups.append({
                    "fid": fid,
                    "slots": sorted(option_set, key=lambda item: (TAGE.index(item[0]) if item[0] in TAGE else 0, item[1])),
                })

    if fixed_slot_map:
        fixed_slot_map = {
            fid: sorted(set(slots), key=lambda item: (TAGE.index(item[0]) if item[0] in TAGE else 0, item[1]))
            for fid, slots in fixed_slot_map.items()
        }

    if basis_errors:
        raise HTTPException(status_code=400, detail=" ".join(sorted(basis_errors)))

    # Solver laufen lassen
    status, solver, model, plan, best_score = solve_best_plan(
        df=df,
        FACH_ID=FACH_ID,
        KLASSEN=KLASSEN,
        LEHRER=LEHRER,
        regeln=rules,
        room_plan=room_plan or None,
        fixed_slots=fixed_slot_map or None,
        flexible_groups=flexible_groups or None,
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
        comment=req.comment,
        version_id=version_id,
    )
    session.add(plan_row)
    session.commit()
    session.refresh(plan_row)

    # Helpers für IDs (bereits vorbereitet)

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


@router.put("/{plan_id}", response_model=Plan)
def update_plan_metadata(plan_id: int, payload: PlanUpdateRequest, session: Session = Depends(get_session)) -> Plan:
    plan = session.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan nicht gefunden")
    data = payload.dict(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        new_name = str(data["name"]).strip()
        if new_name:
            plan.name = new_name
    if "comment" in data:
        plan.comment = data["comment"]
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return plan
