from __future__ import annotations

from typing import List, Dict, Tuple, Optional
import json
from collections import defaultdict
import logging

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


logger = logging.getLogger("stundenplan.plans")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(levelname)s %(name)s: %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.DEBUG)
logger.propagate = True

router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("/rules")
def list_rules() -> dict:
    """Returns available rule switches and soft-weights with defaults and descriptions.
    Kept in sync with stundenplan_regeln.add_constraints expectations.
    """
    return {
        "bools": [
            {
                "key": "stundenbedarf_vollstaendig",
                "label": "Alle Requirements vollständig planen",
                "default": True,
                "info": "Jede geforderte Unterrichtsstunde wird eingeplant (keine Unterdeckung).",
            },
            {
                "key": "keine_lehrerkonflikte",
                "label": "Lehrkraft nicht doppelt belegen",
                "default": True,
                "info": "Verhindert, dass eine Lehrkraft gleichzeitig zwei Klassen unterrichtet.",
            },
            {
                "key": "keine_klassenkonflikte",
                "label": "Klasse nicht doppelt belegen",
                "default": True,
                "info": "Sichert, dass jede Klasse pro Slot höchstens ein Fach hat.",
            },
            {
                "key": "raum_verfuegbarkeit",
                "label": "Raumverfügbarkeiten aus Basisplan berücksichtigen",
                "default": True,
                "info": "Sperrt Räume in Slots, die im Basisplan als nicht verfügbar markiert sind.",
            },
            {
                "key": "basisplan_fixed",
                "label": "Feste Slots aus Basisplan erzwingen",
                "default": True,
                "info": "Übernimmt alle fix eingetragenen Basisplan-Stunden ohne Änderungen.",
            },
            {
                "key": "basisplan_flexible",
                "label": "Flexible Slot-Gruppen aus Basisplan respektieren",
                "default": True,
                "info": "Wählt genau einen Slot aus jeder Basisplan-Optionengruppe.",
            },
            {
                "key": "basisplan_windows",
                "label": "Basisplan-Zeitfenster (Klassen) respektieren",
                "default": True,
                "info": "Sperrt Unterrichtszeiten einer Klasse gemäß den Basisplan-Fenstern.",
            },
            {
                "key": "stundenbegrenzung",
                "label": "Tageslimit (Mo–Do 6, Fr 5)",
                "default": True,
                "info": "Limitiert Unterricht auf 6 Stunden (Mo–Do) bzw. 5 Stunden (Fr).",
            },
            {
                "key": "stundenbegrenzung_erste_stunde",
                "label": "Bei vollem Tag 1. Stunde belegen",
                "default": True,
                "info": "Wenn der Tag voll ist, wird die erste Stunde automatisch belegt.",
            },
            {
                "key": "fach_nachmittag_regeln",
                "label": "Fachspezifische Nachmittag-Regeln anwenden",
                "default": True,
                "info": "Beachtet pro Requirement die Vorgabe 'Nachmittag muss/kann/nein'.",
            },
            {
                "key": "nachmittag_pause_stunde",
                "label": "Nachmittag mit freier 6. Stunde",
                "default": False,
                "info": "Ist Unterricht am Nachmittag geplant, bleibt die 6. Stunde frei.",
            },
            {
                "key": "lehrer_hohlstunden_soft",
                "label": "Lehrer-Hohlstunden (Soft)",
                "default": True,
                "info": "Versucht Hohlstunden für Lehrkräfte zu vermeiden und straft Überschreitungen weich ab.",
            },
            {
                "key": "keine_hohlstunden",
                "label": "Hohlstunden minimieren (Soft)",
                "default": True,
                "info": "Bestraft einzelne Hohlstunden innerhalb eines Tages.",
            },
            {
                "key": "keine_hohlstunden_hard",
                "label": "Keine Hohlstunden (Hard)",
                "default": False,
                "info": "Verbietet Hohlstunden vollständig (streng).",
            },
            {
                "key": "doppelstundenregel",
                "label": "Doppelstunden-Regel (max 2 in Folge)",
                "default": True,
                "info": "Setzt Doppelstunden gemäß Muss/Kann/Nein und verhindert Dreierblöcke.",
            },
            {
                "key": "einzelstunde_nur_rand",
                "label": "Einzelstunde nur Rand (bei DS=muss)",
                "default": True,
                "info": "Bei Pflicht-Doppelstunden dürfen Einzelstunden nur an Randpositionen liegen.",
            },
            {
                "key": "bandstunden_parallel",
                "label": "Bandfächer parallel planen",
                "default": True,
                "info": "Lege Bandfächer (is_bandfach) parallel in allen beteiligten Klassen und verteilt sie auf unterschiedliche Tage.",
            },
            {
                "key": "gleichverteilung",
                "label": "Gleichverteilung über Woche (Soft)",
                "default": True,
                "info": "Sorgt soft dafür, dass Tageslasten möglichst gleich verteilt sind.",
            },
            {
                "key": "mittagsschule_vormittag",
                "label": "Vormittagsminimum je Tag",
                "default": True,
                "info": "Verlangt an jedem Tag mindestens vier Stunden Unterricht vor der Mittagspause.",
            },
        ],
        "weights": [
            {
                "key": "W_GAPS_START",
                "label": "Gewicht Startlücke",
                "default": 2,
                "min": 0,
                "max": 50,
                "info": "Penalty für freie erste Stunde, wenn danach Unterricht folgt.",
            },
            {
                "key": "W_GAPS_INSIDE",
                "label": "Gewicht Hohlstunden (innen)",
                "default": 3,
                "min": 0,
                "max": 50,
                "info": "Penalty für Lücken zwischen zwei belegten Stunden.",
            },
            {
                "key": "W_EVEN_DIST",
                "label": "Gewicht Gleichverteilung",
                "default": 1,
                "min": 0,
                "max": 50,
                "info": "Penalty für Tagesabweichungen von der durchschnittlichen Klassenlast.",
            },
            {
                "key": "W_EINZEL_KANN",
                "label": "Gewicht Einzelstunden-Penalty (DS=kann)",
                "default": 5,
                "min": 0,
                "max": 50,
                "info": "Penalty für Einzelstunden, wenn Doppelstunden optional erlaubt sind.",
            },
            {
                "key": "TEACHER_GAPS_DAY_MAX",
                "label": "Lehrer-Lücken pro Tag",
                "default": 1,
                "min": 0,
                "max": 6,
                "info": "Zulässige Anzahl an Hohlstunden pro Lehrkraft und Tag, bevor Strafpunkte greifen.",
            },
            {
                "key": "TEACHER_GAPS_WEEK_MAX",
                "label": "Lehrer-Lücken pro Woche",
                "default": 3,
                "min": 0,
                "max": 20,
                "info": "Zulässige Hohlstunden pro Lehrkraft und Woche.",
            },
            {
                "key": "W_TEACHER_GAPS",
                "label": "Gewicht Lehrer-Hohlstunden",
                "default": 2,
                "min": 0,
                "max": 50,
                "info": "Strafgewicht für Lehrkräfte-Hohlstunden über den erlaubten Grenzen.",
            },
        ],
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
    logger.info(
        "GeneratePlan called | version=%s profile=%s dry_run=%s params=%s overrides=%s",
        version_id,
        req.rule_profile_id,
        req.dry_run,
        req.params.dict() if hasattr(req.params, "dict") else req.params,
        list((req.override_rules or {}).keys()),
    )
    # Daten laden
    df, FACH_ID, KLASSEN, LEHRER = fetch_requirements_dataframe(session, version_id=version_id)
    if df.empty:
        msg = "Keine Requirements in der DB – bitte zuerst Bedarf anlegen."
        if version_id is not None:
            msg = f"Keine Requirements für Version #{version_id} gefunden – bitte zuerst Bedarf anlegen."
        raise HTTPException(status_code=400, detail=msg)

    logger.info(
        "Requirements loaded | rows=%d hours=%s classes=%s teachers=%s subjects=%s",
        len(df),
        df["Wochenstunden"].sum() if "Wochenstunden" in df.columns else "n/a",
        sorted(set(str(val) for val in df["Klasse"])) if "Klasse" in df.columns else [],
        sorted(set(str(val) for val in df["Lehrer"])) if "Lehrer" in df.columns else [],
        sorted(set(str(val) for val in df["Fach"])) if "Fach" in df.columns else [],
    )
    logger.debug("Requirements raw payload: %s", df.to_dict(orient="records"))

    rules_definition = list_rules()
    bool_rule_keys = {entry["key"] for entry in rules_definition.get("bools", [])}
    weight_rule_keys = {entry["key"] for entry in rules_definition.get("weights", [])}
    effective_rules: dict[str, int | bool] = {}
    for entry in rules_definition.get("bools", []):
        effective_rules[entry["key"]] = bool(entry.get("default", False))
    for entry in rules_definition.get("weights", []):
        default_val = entry.get("default")
        if default_val is None:
            default_val = 0
        effective_rules[entry["key"]] = int(default_val)

    def _coerce_bool(value: object, fallback: bool) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return fallback if value is None else bool(value)

    def _coerce_int(value: object, fallback: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            try:
                return int(float(value))
            except (TypeError, ValueError):
                return fallback

    subject_rows = session.exec(select(Subject)).all()
    class_rows = session.exec(select(Class)).all()
    teacher_rows = session.exec(select(Teacher)).all()

    subject_id_to_name = {s.id: s.name for s in subject_rows}
    subjects_by_name = {s.name: s.id for s in subject_rows}
    class_id_to_name = {c.id: c.name for c in class_rows}
    classes_by_name = {c.name: c.id for c in class_rows}
    teachers_by_name = {t.name: t.id for t in teacher_rows}

    # Regelprofil laden oder Defaults
    if req.rule_profile_id is not None:
        prof = session.get(RuleProfile, req.rule_profile_id)
        if not prof:
            raise HTTPException(status_code=404, detail="Regelprofil nicht gefunden")
        prof_dict = _rules_to_dict(prof.dict())
        for entry in rules_definition.get("bools", []):
            key = entry["key"]
            if key in prof_dict and prof_dict[key] is not None:
                effective_rules[key] = _coerce_bool(prof_dict[key], bool(effective_rules.get(key, False)))
        for entry in rules_definition.get("weights", []):
            key = entry["key"]
            if key in prof_dict and prof_dict[key] is not None:
                effective_rules[key] = _coerce_int(prof_dict[key], int(effective_rules.get(key, 0)))
        if "leseband_parallel" in prof_dict and "bandstunden_parallel" in effective_rules:
            effective_rules["bandstunden_parallel"] = _coerce_bool(
                prof_dict["leseband_parallel"],
                bool(effective_rules.get("bandstunden_parallel", True)),
            )

    if req.override_rules:
        for key, value in req.override_rules.items():
            if key in bool_rule_keys:
                effective_rules[key] = _coerce_bool(value, bool(effective_rules.get(key, False)))
            elif key in weight_rule_keys:
                effective_rules[key] = _coerce_int(value, int(effective_rules.get(key, 0)))
            else:
                effective_rules[key] = value
        if "leseband_parallel" in req.override_rules and "bandstunden_parallel" in effective_rules:
            effective_rules["bandstunden_parallel"] = _coerce_bool(
                req.override_rules["leseband_parallel"],
                bool(effective_rules.get("bandstunden_parallel", True)),
            )

    active_rule_keys = sorted(
        key for key in bool_rule_keys if bool(effective_rules.get(key))
    )

    logger.info(
        "Effective rule toggles: %s",
        {k: bool(effective_rules.get(k)) for k in sorted(bool_rule_keys)},
    )

    # Basisplan-Raumverfügbarkeit laden (optional)
    room_plan: dict[int, dict[str, list[bool]]] = {}
    class_windows_by_name: dict[str, dict[str, list[bool]]] = {}
    class_fixed_lookup: dict[str, dict[str, set[int]]] = {}
    flexible_slot_lookup: dict[tuple[str, str, int], bool] = {}
    basis_payload: Dict[str, object] = {}
    basis_row = session.exec(select(BasisPlan)).first()
    if basis_row and basis_row.data:
        try:
            basis_payload = json.loads(basis_row.data)
        except json.JSONDecodeError:
            basis_payload = {}
        logger.info(
            "Basisplan loaded | id=%s updated_at=%s keys=%s",
            basis_row.id,
            basis_row.updated_at,
            list(basis_payload.keys()),
        )
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
        logger.info("Basisplan room configs: %d", len(room_plan))
    else:
        if basis_row:
            logger.warning("Basisplan row found but contains keine/ungültige Daten.")
        else:
            logger.info("Basisplan nicht vorhanden – es werden keine Raumfenster berücksichtigt.")

    DAY_KEY_TO_TAG = {
        "mon": "Mo",
        "tue": "Di",
        "wed": "Mi",
        "thu": "Do",
        "fri": "Fr",
    }

    classes_cfg = basis_payload.get("classes") or {}
    if isinstance(classes_cfg, dict):
        for class_key, cfg in classes_cfg.items():
            try:
                class_id_int = int(class_key)
            except (TypeError, ValueError):
                continue
            allowed_cfg = cfg.get("allowed") or {}
            fixed_entries = cfg.get("fixed") or []
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
            class_name = class_id_to_name.get(class_id_int) if 'class_id_to_name' in locals() else None
            if class_name:
                class_windows_by_name[class_name] = normalized
            else:
                class_windows_by_name[str(class_id_int)] = normalized

    def map_windows(entry: dict | None) -> dict[str, list[bool]] | None:
        if not isinstance(entry, dict):
            return None
        allowed = entry.get("allowed") or {}
        normalized: dict[str, list[bool]] = {}
        for key, array in allowed.items():
            if not isinstance(array, list):
                continue
            key_lower = str(key).lower()
            canonical = key_lower[:3]
            tag = DAY_KEY_TO_TAG.get(key_lower) or DAY_KEY_TO_TAG.get(canonical) or key_lower.capitalize()[:2]
            normalized[tag] = [
                        bool(array[i]) if i < len(array) else True
                        for i in range(8)
                    ]
        return normalized if normalized else None

    windows_cfg = basis_payload.get("windows") or {}
    if isinstance(windows_cfg, dict):
        default_map = map_windows(windows_cfg.get("__all"))
        for class_key, entry in windows_cfg.items():
            if class_key == "__all":
                continue
            try:
                class_id_int = int(class_key)
            except (TypeError, ValueError):
                continue
            mapped = map_windows(entry)
            final_map = mapped or default_map
            if not final_map:
                continue
            class_name = class_id_to_name.get(class_id_int) if 'class_id_to_name' in locals() else None
            if class_name:
                class_windows_by_name[class_name] = final_map
            else:
                class_windows_by_name.setdefault(str(class_id_int), final_map)
    if class_windows_by_name:
        logger.info("Basisplan class windows: %d", len(class_windows_by_name))

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
            class_name = class_id_to_name.get(class_id_int) or str(class_id_int)
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
                class_fixed_lookup.setdefault(class_name, {}).setdefault(solver_day, set()).add(slot_int)

    flex_cfg = basis_payload.get("flexible") or {}
    if isinstance(flex_cfg, dict):
        for class_key, groups in flex_cfg.items():
            try:
                class_id_int = int(class_key)
            except (TypeError, ValueError):
                continue
            class_name = class_id_to_name.get(class_id_int) or str(class_id_int)
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
                for solver_day, slot_int in option_set:
                    flexible_slot_lookup[(class_name, solver_day, slot_int)] = True
                flexible_groups.append({
                    "fid": fid,
                    "slots": sorted(option_set, key=lambda item: (TAGE.index(item[0]) if item[0] in TAGE else 0, item[1])),
                })

    if fixed_slot_map:
        fixed_slot_map = {
            fid: sorted(set(slots), key=lambda item: (TAGE.index(item[0]) if item[0] in TAGE else 0, item[1]))
            for fid, slots in fixed_slot_map.items()
        }
    logger.info(
        "Basisplan summary | fixed_requirements=%d fixed_slots_total=%d flexible_groups=%d",
        len(fixed_slot_map),
        sum(len(slots) for slots in fixed_slot_map.values()) if fixed_slot_map else 0,
        len(flexible_groups),
    )

    if basis_errors:
        raise HTTPException(status_code=400, detail=" ".join(sorted(basis_errors)))

    # Solver laufen lassen
    logger.info(
        "Launching solver | requirements=%d classes=%s teachers=%s rule_count=%d dry_run=%s",
        len(FACH_ID),
        KLASSEN,
        LEHRER,
        len(effective_rules),
        req.dry_run,
    )
    status, solver, model, plan, best_score = solve_best_plan(
        df=df,
        FACH_ID=FACH_ID,
        KLASSEN=KLASSEN,
        LEHRER=LEHRER,
        regeln=effective_rules,
        room_plan=room_plan or None,
        fixed_slots=fixed_slot_map or None,
        flexible_groups=flexible_groups or None,
        class_windows=class_windows_by_name or None,
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
        try:
            stats = solver.ResponseStats()
        except Exception:
            stats = "n/a"
        try:
            model_dump = solver.ExportModelAsString()
        except Exception:
            model_dump = "<unavailable>"
        logger.warning("Solver returned %s | score=%s | stats=%s", status, best_score, stats)
        logger.debug("Model snapshot (truncated): %s", model_dump[:5000])
        raise HTTPException(status_code=422, detail="Keine Lösung gefunden.")

    solver_status_label = {cp_model.OPTIMAL: "OPTIMAL", cp_model.FEASIBLE: "FEASIBLE"}.get(status, str(status))
    try:
        logger.info(
            "Solver finished | status=%s score=%.2f objective=%s stats=%s",
            solver_status_label,
            best_score or 0.0,
            solver.ObjectiveValue() if hasattr(solver, "ObjectiveValue") else None,
            solver.ResponseStats(),
        )
    except Exception:
        logger.info(
            "Solver finished | status=%s score=%.2f (stats unavailable)",
            solver_status_label,
            best_score or 0.0,
        )

    # Slots sammeln
    solver_slots: List[dict] = []
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
                    solver_slots.append(
                        {
                            "class_id": class_id,
                            "tag": tag,
                            "stunde": std + 1,
                            "subject_id": subject_id,
                            "teacher_id": teacher_id,
                        }
                    )

    slots_out: List[PlanSlotOut] = []
    for entry in solver_slots:
        class_name_lookup = class_id_to_name.get(entry["class_id"]) or str(entry["class_id"])
        subject_name_lookup = subject_id_to_name.get(entry["subject_id"])
        info = class_fixed_lookup.get(class_name_lookup, {})
        day_fixed = info.get(entry["tag"], set())
        is_fixed = (entry["stunde"] - 1) in day_fixed
        is_flexible = bool(flexible_slot_lookup.get((class_name_lookup, entry["tag"], entry["stunde"] - 1)))
        slots_out.append(
            PlanSlotOut(
                class_id=entry["class_id"],
                tag=entry["tag"],
                stunde=entry["stunde"],
                subject_id=entry["subject_id"],
                teacher_id=entry["teacher_id"],
                is_fixed=is_fixed,
                is_flexible=is_flexible,
            )
        )

    if req.dry_run:
        return GenerateResponse(
            plan_id=None,
            status=solver_status_label,
            score=best_score,
            objective_value=solver.ObjectiveValue() if hasattr(solver, "ObjectiveValue") else None,
            slots=slots_out,
            rules_snapshot=dict(effective_rules),
            rule_keys_active=active_rule_keys,
            params_used=req.params,
        )

    # Plan speichern
    plan_row = Plan(
        name=req.name,
        rule_profile_id=req.rule_profile_id,
        seed=req.params.base_seed,
        status=solver_status_label,
        score=best_score,
        objective_value=solver.ObjectiveValue() if hasattr(solver, "ObjectiveValue") else None,
        comment=req.comment,
        version_id=version_id,
    )
    session.add(plan_row)
    session.commit()
    session.refresh(plan_row)

    for entry in solver_slots:
        slot = PlanSlot(
            plan_id=plan_row.id,
            class_id=entry["class_id"],
            tag=entry["tag"],
            stunde=entry["stunde"],
            subject_id=entry["subject_id"],
            teacher_id=entry["teacher_id"],
        )
        session.add(slot)

    session.commit()

    return GenerateResponse(
        plan_id=plan_row.id,
        status=plan_row.status,
        score=plan_row.score,
        objective_value=plan_row.objective_value,
        slots=slots_out,
        rules_snapshot=dict(effective_rules),
        rule_keys_active=active_rule_keys,
        params_used=req.params,
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
