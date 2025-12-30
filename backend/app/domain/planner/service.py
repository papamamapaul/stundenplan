from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Dict, List, Optional, Set, Tuple

from fastapi import HTTPException
from ortools.sat.python import cp_model
from sqlmodel import Session, select

from ...models import (
    Class,
    DistributionVersion,
    Plan,
    PlanSlot,
    Room,
    RuleProfile,
    Subject,
    Teacher,
)
from ...schemas import GenerateRequest, GenerateResponse, PlanSlotOut
from ..accounts.service import resolve_account, resolve_planning_period
from .data_access import fetch_requirements_dataframe
from .rules import rules_to_dict
from .rules_config import get_rule_definitions
from .solver_protocol import PlannerSolver, SolverInputs
from ...infrastructure.solver.ortools_solver import OrToolsPlannerSolver
from ...utils import TAGE
from .basis_parser import BasisPlanContext, BasisPlanParser
from ..plans.schema import ensure_plan_schema


logger = logging.getLogger("stundenplan.planner")


class PlannerService:
    def __init__(self, session: Session, solver: Optional[PlannerSolver] = None) -> None:
        self.session = session
        self.solver = solver or OrToolsPlannerSolver()
        self.basis_parser = BasisPlanParser(session)
        ensure_plan_schema(self.session)

    def generate_plan(
        self,
        req: GenerateRequest,
        account_id: Optional[int],
        planning_period_id: Optional[int],
    ) -> GenerateResponse:
        account = resolve_account(self.session, account_id)
        period = resolve_planning_period(self.session, account, planning_period_id)
        self._resolve_version(req.version_id, account, period)

        df, FACH_ID, KLASSEN, LEHRER, teacher_workdays, pool_teacher_names = fetch_requirements_dataframe(
            self.session,
            account_id=account.id,
            planning_period_id=period.id,
            version_id=req.version_id,
        )
        if df.empty:
            msg = "Keine Requirements in der DB – bitte zuerst Bedarf anlegen."
            if req.version_id is not None:
                msg = f"Keine Requirements für Version #{req.version_id} gefunden – bitte zuerst Bedarf anlegen."
            raise HTTPException(status_code=400, detail=msg)

        rules_definition = get_rule_definitions()
        effective_rules, active_rule_keys = self._build_ruleset(req, account, rules_definition)
        effective_rules = self._ensure_rule_mapping(effective_rules)
        logger.debug("Effective rules prepared | type=%s keys=%s", type(effective_rules), list(effective_rules.keys()))

        subject_rows = self.session.exec(select(Subject).where(Subject.account_id == account.id)).all()
        class_rows = self.session.exec(select(Class).where(Class.account_id == account.id)).all()
        teacher_rows = self.session.exec(select(Teacher).where(Teacher.account_id == account.id)).all()
        room_rows = self.session.exec(select(Room).where(Room.account_id == account.id)).all()

        subject_id_to_name = {s.id: s.name for s in subject_rows}
        subjects_by_name = {s.name: s.id for s in subject_rows}
        class_id_to_name = {c.id: c.name for c in class_rows}
        classes_by_name = {c.name: c.id for c in class_rows}
        teacher_id_to_name = {t.id: t.name for t in teacher_rows}
        teachers_by_name = {t.name: t.id for t in teacher_rows}
        room_id_to_name = {r.id: r.name for r in room_rows}
        subject_required_map = {s.id: s.required_room_id for s in subject_rows}

        basis_context = self.basis_parser.parse(
            account.id,
            period.id,
            df,
            FACH_ID,
            class_id_to_name,
            subject_id_to_name,
        )

        solver_inputs: SolverInputs = {
            "df": df,
            "FACH_ID": FACH_ID,
            "KLASSEN": KLASSEN,
            "LEHRER": LEHRER,
            "regeln": dict(self._ensure_rule_mapping(effective_rules)),
            "teacher_workdays": teacher_workdays,
            "pool_teacher_names": pool_teacher_names,
            "room_plan": basis_context.room_plan,
            "fixed_slots": basis_context.fixed_slot_map,
            "flexible_groups": basis_context.flexible_groups,
            "flexible_slot_limits": basis_context.flexible_slot_limits,
            "class_windows": basis_context.class_windows_by_name,
            "pause_slots": basis_context.pause_slots,
            "slots_per_day": basis_context.slots_per_day,
            "multi_start": req.params.multi_start,
            "max_attempts": req.params.max_attempts,
            "patience": req.params.patience,
            "time_per_attempt": req.params.time_per_attempt,
            "randomize_search": req.params.randomize_search,
            "base_seed": req.params.base_seed,
            "seed_step": req.params.seed_step,
            "use_value_hints": req.params.use_value_hints,
        }

        solver_output = self.solver.solve(solver_inputs)
        status = solver_output["status"]
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            status_label = _status_label(status)
            logger.warning(
                "Solver failed | status=%s score=%s", status_label, solver_output.get("score")
            )
            raise HTTPException(status_code=422, detail="Keine Lösung gefunden.")

        slots_out = self._build_slot_outputs(
            solver_output,
            df,
            FACH_ID,
            subject_id_to_name,
            class_id_to_name,
            teacher_id_to_name,
            room_id_to_name,
            basis_context,
            subjects_by_name,
            teachers_by_name,
            classes_by_name,
            subject_required_map,
        )

        if req.dry_run:
            return GenerateResponse(
                plan_id=None,
                status=_status_label(status),
                score=solver_output["score"],
                objective_value=solver_output["solver"].ObjectiveValue()
                if hasattr(solver_output["solver"], "ObjectiveValue")
                else None,
                slots=slots_out,
                slots_meta=basis_context.slots_meta,
                rules_snapshot=dict(effective_rules),
                rule_keys_active=active_rule_keys,
                params_used=req.params,
                planning_period_id=period.id,
            )

        plan = Plan(
            account_id=account.id,
            name=req.name,
            rule_profile_id=req.rule_profile_id,
            seed=req.params.base_seed,
            status=_status_label(status),
            score=solver_output["score"],
            objective_value=solver_output["solver"].ObjectiveValue()
            if hasattr(solver_output["solver"], "ObjectiveValue")
            else None,
            comment=req.comment,
            version_id=req.version_id,
            rules_snapshot=json.dumps(dict(effective_rules)),
            rule_keys_active=json.dumps(active_rule_keys),
            params_used=json.dumps(req.params.model_dump()),
            planning_period_id=period.id,
        )
        self.session.add(plan)
        self.session.commit()
        self.session.refresh(plan)

        for entry in slots_out:
            slot = PlanSlot(
                account_id=account.id,
                plan_id=plan.id,
                planning_period_id=plan.planning_period_id,
                class_id=entry.class_id,
                tag=entry.tag,
                stunde=entry.stunde,
                subject_id=entry.subject_id,
                teacher_id=entry.teacher_id,
                room_id=entry.room_id,
            )
            self.session.add(slot)
        self.session.commit()

        return GenerateResponse(
            plan_id=plan.id,
            status=plan.status,
            score=plan.score,
            objective_value=plan.objective_value,
            slots=slots_out,
            slots_meta=basis_context.slots_meta,
            rules_snapshot=dict(effective_rules),
            rule_keys_active=active_rule_keys,
            params_used=req.params,
            planning_period_id=plan.planning_period_id,
        )

    def analyze_requirements(
        self,
        version_id: Optional[int],
        account_id: Optional[int],
        planning_period_id: Optional[int],
    ) -> dict:
        account = resolve_account(self.session, account_id)
        period = resolve_planning_period(self.session, account, planning_period_id)
        if version_id is not None:
            self._resolve_version(version_id, account, period)

        df, *_ = fetch_requirements_dataframe(
            self.session,
            account_id=account.id,
            planning_period_id=period.id,
            version_id=version_id,
        )
        if df.empty:
            return {"ok": True, "empty": True}

        per_class = (
            df.groupby(df["Klasse"].astype(str))[["Wochenstunden"]]
            .sum()
            .reset_index()
            .rename(columns={"Klasse": "klasse", "Wochenstunden": "stunden"})
        )
        per_class_subject = (
            df.groupby([df["Klasse"].astype(str), df["Fach"].astype(str)])[["Wochenstunden"]]
            .sum()
            .reset_index()
            .rename(columns={"Klasse": "klasse", "Fach": "fach", "Wochenstunden": "stunden"})
        )
        per_teacher = (
            df.groupby(df["Lehrer"].astype(str))[["Wochenstunden"]]
            .sum()
            .reset_index()
            .rename(columns={"Lehrer": "lehrer", "Wochenstunden": "stunden"})
        )

        teacher_rows = self.session.exec(select(Teacher).where(Teacher.account_id == account.id)).all()
        deputat_lookup = {t.name: (t.deputat or t.deputat_soll) for t in teacher_rows}
        teacher_info = [
            {
                "lehrer": row["lehrer"],
                "stunden": int(row["stunden"]),
                "deputat": int(deputat_lookup.get(row["lehrer"], 0) or 0),
            }
            for _, row in per_teacher.iterrows()
        ]

        def _flag_counts(column: str):
            if column not in df.columns:
                return None
            return df[column].value_counts().to_dict()

        return {
            "ok": True,
            "classes": per_class.to_dict(orient="records"),
            "class_subjects": per_class_subject.to_dict(orient="records"),
            "teachers": teacher_info,
            "flags": {
                "Doppelstunde": _flag_counts("Doppelstunde"),
                "Nachmittag": _flag_counts("Nachmittag"),
            },
            "rules": get_rule_definitions(),
        }

    def _resolve_version(self, version_id, account, period):
        if version_id is None:
            return None
        version = self.session.get(DistributionVersion, version_id)
        if not version or version.account_id != account.id:
            raise HTTPException(status_code=404, detail="Version nicht gefunden")
        if version.planning_period_id not in (None, period.id):
            raise HTTPException(status_code=404, detail="Version gehört zu einer anderen Planungsperiode.")
        if version.planning_period_id is None:
            version.planning_period_id = period.id
            self.session.add(version)
            self.session.commit()
            self.session.refresh(version)
        return version

    def _build_ruleset(self, req: GenerateRequest, account, rules_definition: dict) -> Tuple[dict, List[str]]:
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

        if req.rule_profile_id is not None:
            prof = self.session.get(RuleProfile, req.rule_profile_id)
            if not prof or prof.account_id != account.id:
                raise HTTPException(status_code=404, detail="Regelprofil nicht gefunden")
            prof_dict = rules_to_dict(prof.model_dump())
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

        if isinstance(effective_rules, set):
            effective_rules = {key: True for key in effective_rules}
        elif not isinstance(effective_rules, dict):
            effective_rules = dict(effective_rules)

        active_rule_keys = sorted(
            key for key in bool_rule_keys if bool(effective_rules.get(key))
        )
        return self._ensure_rule_mapping(effective_rules), active_rule_keys

    def _ensure_rule_mapping(self, rules_obj):
        if isinstance(rules_obj, dict):
            return rules_obj
        if isinstance(rules_obj, set):
            logger.warning("Rules received as set; coercing to mapping | values=%s", rules_obj)
            return {key: True for key in rules_obj}
        try:
            return dict(rules_obj)
        except Exception as exc:
            logger.error("Failed to coerce rules into mapping | type=%s error=%s", type(rules_obj), exc)
            raise HTTPException(status_code=500, detail="Ungültige Regelkonfiguration")

    def _build_slot_outputs(
        self,
        solver_output,
        df,
        FACH_ID,
        subject_id_to_name,
        class_id_to_name,
        teacher_id_to_name,
        room_id_to_name,
        basis_context,
        subjects_by_name,
        teachers_by_name,
        classes_by_name,
        subject_required_map,
    ):
        solver = solver_output["solver"]
        plan_matrix = solver_output["plan"]
        slots_per_day = basis_context.slots_per_day

        solver_slots = self._collect_solver_assignments(
            df,
            FACH_ID,
            plan_matrix,
            solver,
            slots_per_day,
            subjects_by_name,
            teachers_by_name,
            classes_by_name,
            subject_required_map,
        )
        return self._attach_slot_metadata(
            solver_slots,
            class_id_to_name,
            room_id_to_name,
            basis_context,
        )

    def _collect_solver_assignments(
        self,
        df,
        FACH_ID,
        plan_matrix,
        solver,
        slots_per_day: int,
        subjects_by_name,
        teachers_by_name,
        classes_by_name,
        subject_required_map,
    ) -> List[dict]:
        solver_slots: List[dict] = []
        for fid in FACH_ID:
            fach = str(df.loc[fid, "Fach"])
            klasse = str(df.loc[fid, "Klasse"])
            lehrer = str(df.loc[fid, "Lehrer"])
            subject_id = subjects_by_name.get(fach)
            teacher_id = teachers_by_name.get(lehrer)
            class_id = classes_by_name.get(klasse)
            if subject_id is None or teacher_id is None or class_id is None:
                continue
            for tag in TAGE:
                for std in range(slots_per_day):
                    var = plan_matrix.get((fid, tag, std))
                    if var is not None and solver.Value(var) == 1:
                        solver_slots.append(
                            {
                                "class_id": class_id,
                                "tag": tag,
                                "stunde": std + 1,
                                "subject_id": subject_id,
                                "teacher_id": teacher_id,
                                "room_id": subject_required_map.get(subject_id),
                                "fid": fid,
                            }
                        )
        return solver_slots

    def _attach_slot_metadata(
        self,
        solver_slots: List[dict],
        class_id_to_name,
        room_id_to_name,
        basis_context: BasisPlanContext,
    ) -> List[PlanSlotOut]:
        slots_out: List[PlanSlotOut] = []
        for entry in solver_slots:
            if entry.get("class_id") is None or entry.get("subject_id") is None or entry.get("teacher_id") is None:
                continue
            class_name_lookup = class_id_to_name.get(entry["class_id"]) or str(entry["class_id"])
            info = basis_context.class_fixed_lookup.get(class_name_lookup, {})
            day_fixed = info.get(entry["tag"], set())
            is_fixed = (entry["stunde"] - 1) in day_fixed
            allowed_fids = basis_context.flexible_slot_lookup.get(
                (class_name_lookup, entry["tag"], entry["stunde"] - 1)
            )
            is_flexible = False
            if allowed_fids:
                fid = entry.get("fid")
                is_flexible = fid in allowed_fids if fid is not None else True
            room_id = entry.get("room_id")
            slots_out.append(
                PlanSlotOut(
                    class_id=entry["class_id"],
                    tag=entry["tag"],
                    stunde=entry["stunde"],
                    subject_id=entry["subject_id"],
                    teacher_id=entry["teacher_id"],
                    room_id=room_id,
                    room_name=room_id_to_name.get(room_id) if room_id else None,
                    is_fixed=is_fixed,
                    is_flexible=is_flexible,
                )
            )
        return slots_out

    def _register_flexible_limit(
        self,
        flexible_slot_limits: Dict[Tuple[str, str, int], set[int]],
        class_name: str,
        solver_day: str,
        slot_int: int,
        fid: int,
    ) -> None:
        flexible_slot_limits.setdefault((class_name, solver_day, slot_int), set()).add(fid)

    def _build_fid_picker(self, df, FACH_ID):
        """Return helper for mapping (class, subject) pairs to unique fitted ids."""
        fid_hours = {fid: int(df.loc[fid, "Wochenstunden"]) for fid in FACH_ID}
        fid_usage = defaultdict(int)
        class_subject_fids: Dict[Tuple[str, str], List[int]] = defaultdict(list)
        for fid in FACH_ID:
            key = (str(df.loc[fid, "Klasse"]), str(df.loc[fid, "Fach"]))
            class_subject_fids[key].append(fid)

        def pick_fid(key: Tuple[str, str]) -> Optional[int]:
            fids = class_subject_fids.get(key)
            if not fids:
                return None
            for fid in fids:
                if fid_usage[fid] < fid_hours[fid]:
                    fid_usage[fid] += 1
                    return fid
            return None

        return pick_fid


def _status_label(status: int) -> str:
    return {cp_model.OPTIMAL: "OPTIMAL", cp_model.FEASIBLE: "FEASIBLE"}.get(status, str(status))
