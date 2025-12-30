from __future__ import annotations

import json
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import delete
from sqlmodel import Session, select

from ...models import BasisPlan, Class, Plan, PlanSlot, Room, Subject, Teacher
from ...schemas import (
    GenerateParams,
    PlanDetail,
    PlanSlotOut,
    PlanSlotsUpdateRequest,
    PlanUpdateRequest,
    PlanSummary,
)
from ..accounts.service import resolve_account, resolve_planning_period
from .schema import ensure_plan_schema


def _safe_json_load(raw: Optional[str], fallback):
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback


class PlanQueryService:
    def __init__(self, session: Session) -> None:
        self.session = session
        ensure_plan_schema(self.session)

    def list_plans_for_request(
        self,
        account_id: Optional[int],
        planning_period_id: Optional[int],
        limit: Optional[int] = None,
    ) -> List[PlanSummary]:
        account, period = self._resolve_context(account_id, planning_period_id)
        return self.list_plans(account, period, limit)

    def list_plans(
        self,
        account,
        period,
        limit: Optional[int] = None,
    ) -> List[PlanSummary]:
        stmt = (
            select(Plan)
            .where(Plan.account_id == account.id)
            .where(
                (Plan.planning_period_id == period.id)
                | (Plan.planning_period_id == None)  # noqa: E711
            )
            .order_by(Plan.created_at.desc())
        )
        if limit:
            stmt = stmt.limit(int(limit))
        rows = self.session.exec(stmt).all()
        dirty = False
        filtered: List[Plan] = []
        for row in rows:
            if row.planning_period_id is None:
                row.planning_period_id = period.id
                self.session.add(row)
                dirty = True
            if row.planning_period_id == period.id:
                filtered.append(row)
        if dirty:
            self.session.commit()
        summaries: List[PlanSummary] = []
        for row in filtered:
            rule_keys = _safe_json_load(row.rule_keys_active, [])
            summaries.append(
                PlanSummary(
                    id=row.id,
                    name=row.name,
                    status=row.status,
                    score=row.score,
                    objective_value=row.objective_value,
                    created_at=row.created_at,
                    version_id=row.version_id,
                    comment=row.comment,
                    rule_profile_id=row.rule_profile_id,
                    rule_keys_active=rule_keys,
                    planning_period_id=row.planning_period_id,
                )
            )
        return summaries

    def get_plan_detail_for_request(
        self,
        plan_id: int,
        account_id: Optional[int],
        planning_period_id: Optional[int],
    ) -> PlanDetail:
        account, period = self._resolve_context(account_id, planning_period_id)
        return self.get_plan_detail(plan_id, account, period)

    def get_plan_detail(
        self,
        plan_id: int,
        account,
        period,
    ) -> PlanDetail:
        plan = self._get_plan_for_account(plan_id, account, period)

        slots_meta_payload = self._load_basisplan_slots_meta(account.id, plan.planning_period_id)

        slot_rows = self.session.exec(
            select(PlanSlot).where(
                PlanSlot.plan_id == plan_id,
                PlanSlot.account_id == account.id,
                (PlanSlot.planning_period_id == plan.planning_period_id)
                | (PlanSlot.planning_period_id == None),  # noqa: E711
            ).order_by(PlanSlot.tag, PlanSlot.stunde)
        ).all()
        room_lookup = {
            room.id: room.name
            for room in self.session.exec(select(Room).where(Room.account_id == account.id)).all()
        }
        dirty_slots = False
        slots_normalized: List[PlanSlot] = []
        for row in slot_rows:
            if row.planning_period_id is None:
                row.planning_period_id = plan.planning_period_id
                self.session.add(row)
                dirty_slots = True
            if row.planning_period_id == plan.planning_period_id:
                slots_normalized.append(row)
        if dirty_slots:
            self.session.commit()
        slots_out = [
            PlanSlotOut(
                class_id=row.class_id,
                tag=row.tag,
                stunde=row.stunde,
                subject_id=row.subject_id,
                teacher_id=row.teacher_id,
                room_id=row.room_id,
                room_name=room_lookup.get(row.room_id) if row.room_id else None,
                is_fixed=None,
                is_flexible=None,
            )
            for row in slots_normalized
        ]

        if plan.rules_snapshot:
            try:
                rules_snapshot = json.loads(plan.rules_snapshot)
            except json.JSONDecodeError:
                rules_snapshot = None
        else:
            rules_snapshot = None
        if plan.rule_keys_active:
            try:
                rule_keys_active = json.loads(plan.rule_keys_active)
            except json.JSONDecodeError:
                rule_keys_active = []
        else:
            rule_keys_active = []
        params_used = None
        if plan.params_used:
            try:
                params_payload = json.loads(plan.params_used)
                params_used = GenerateParams.model_validate(params_payload)
            except Exception:
                params_used = None

        return PlanDetail(
            id=plan.id,
            name=plan.name,
            status=plan.status,
            score=plan.score,
            objective_value=plan.objective_value,
            created_at=plan.created_at,
            version_id=plan.version_id,
            comment=plan.comment,
            rule_profile_id=plan.rule_profile_id,
            slots=slots_out,
            slots_meta=slots_meta_payload,
            rules_snapshot=rules_snapshot,
            rule_keys_active=rule_keys_active,
            params_used=params_used,
            planning_period_id=plan.planning_period_id,
        )

    def replace_plan_slots_for_request(
        self,
        plan_id: int,
        payload: PlanSlotsUpdateRequest,
        account_id: Optional[int],
        planning_period_id: Optional[int],
    ) -> PlanDetail:
        account, period = self._resolve_context(account_id, planning_period_id)
        return self.replace_plan_slots(plan_id, payload, account, period)

    def replace_plan_slots(
        self,
        plan_id: int,
        payload: PlanSlotsUpdateRequest,
        account,
        period,
    ) -> PlanDetail:
        plan = self._get_plan_for_account(plan_id, account, period)

        self.session.exec(
            delete(PlanSlot).where(
                PlanSlot.plan_id == plan_id,
                PlanSlot.account_id == account.id,
                (PlanSlot.planning_period_id == plan.planning_period_id)
                | (PlanSlot.planning_period_id == None),  # noqa: E711
            )
        )
        self.session.commit()

        for slot in payload.slots:
            cls = self.session.get(Class, slot.class_id)
            if not cls or cls.account_id != account.id:
                raise HTTPException(status_code=400, detail=f"Klasse {slot.class_id} gehört zu einem anderen Account")
            subj = self.session.get(Subject, slot.subject_id)
            if not subj or subj.account_id != account.id:
                raise HTTPException(status_code=400, detail=f"Fach {slot.subject_id} gehört zu einem anderen Account")
            teacher = self.session.get(Teacher, slot.teacher_id)
            if not teacher or teacher.account_id != account.id:
                raise HTTPException(status_code=400, detail=f"Lehrkraft {slot.teacher_id} gehört zu einem anderen Account")
            room_id = None
            if getattr(slot, "room_id", None) is not None:
                room = self.session.get(Room, slot.room_id)
                if not room or room.account_id != account.id:
                    raise HTTPException(status_code=400, detail=f"Raum {slot.room_id} gehört zu einem anderen Account")
                room_id = room.id
            self.session.add(
                PlanSlot(
                    account_id=account.id,
                    plan_id=plan_id,
                    class_id=slot.class_id,
                    tag=slot.tag,
                    stunde=slot.stunde,
                    subject_id=slot.subject_id,
                    teacher_id=slot.teacher_id,
                    room_id=room_id,
                    planning_period_id=plan.planning_period_id,
                )
            )

        self.session.commit()
        return self.get_plan_detail(plan_id, account, period)

    def update_plan_metadata_for_request(
        self,
        plan_id: int,
        payload: PlanUpdateRequest,
        account_id: Optional[int],
        planning_period_id: Optional[int],
    ) -> Plan:
        account, period = self._resolve_context(account_id, planning_period_id)
        return self.update_plan_metadata(plan_id, payload, account, period)

    def update_plan_metadata(
        self,
        plan_id: int,
        payload: PlanUpdateRequest,
        account,
        period,
    ) -> Plan:
        plan = self._get_plan_for_account(plan_id, account, period)
        data = payload.model_dump(exclude_unset=True)
        if "name" in data and data["name"] is not None:
            new_name = str(data["name"]).strip()
            if new_name:
                exists = self.session.exec(
                    select(Plan).where(
                        Plan.account_id == account.id,
                        Plan.name == new_name,
                        Plan.id != plan.id,
                        Plan.planning_period_id == plan.planning_period_id,
                    )
                ).first()
                if exists:
                    raise HTTPException(status_code=400, detail="Planname bereits vergeben")
                plan.name = new_name
        if "comment" in data:
            plan.comment = data["comment"]
        self.session.add(plan)
        self.session.commit()
        self.session.refresh(plan)
        return plan

    def delete_plan_for_request(
        self,
        plan_id: int,
        account_id: Optional[int],
        planning_period_id: Optional[int],
    ) -> None:
        account, period = self._resolve_context(account_id, planning_period_id)
        self.delete_plan(plan_id, account, period)

    def delete_plan(
        self,
        plan_id: int,
        account,
        period,
    ) -> None:
        plan = self._get_plan_for_account(plan_id, account, period)
        self.session.exec(
            delete(PlanSlot).where(
                PlanSlot.plan_id == plan_id,
                PlanSlot.account_id == account.id,
                (PlanSlot.planning_period_id == plan.planning_period_id)
                | (PlanSlot.planning_period_id == None),  # noqa: E711
            )
        )
        self.session.delete(plan)
        self.session.commit()

    def _resolve_context(self, account_id, planning_period_id):
        account = resolve_account(self.session, account_id)
        period = resolve_planning_period(self.session, account, planning_period_id)
        return account, period

    def _load_basisplan_slots_meta(self, account_id: int, planning_period_id: int) -> List[dict]:
        slots_meta_payload: List[dict] = []
        basis_row = self.session.exec(
            select(BasisPlan).where(
                BasisPlan.account_id == account_id,
                BasisPlan.planning_period_id == planning_period_id,
            )
        ).first()
        if basis_row and basis_row.data:
            try:
                basis_payload = json.loads(basis_row.data)
            except json.JSONDecodeError:
                basis_payload = {}
            meta_cfg = basis_payload.get("meta") if isinstance(basis_payload, dict) else {}
            if isinstance(meta_cfg, dict):
                meta_slots = meta_cfg.get("slots")
                if isinstance(meta_slots, list):
                    for idx, slot_entry in enumerate(meta_slots):
                        if isinstance(slot_entry, dict):
                            slots_meta_payload.append({
                                "index": idx,
                                "label": slot_entry.get("label") or f"{idx + 1}. Stunde",
                                "start": slot_entry.get("start"),
                                "end": slot_entry.get("end"),
                                "is_pause": bool(slot_entry.get("isPause")),
                            })
                        else:
                            slots_meta_payload.append({
                                "index": idx,
                                "label": f"{idx + 1}. Stunde",
                                "start": None,
                                "end": None,
                                "is_pause": False,
                            })
        return slots_meta_payload

    def _get_plan_for_account(self, plan_id: int, account, period) -> Plan:
        plan = self.session.get(Plan, plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan nicht gefunden")
        if plan.account_id != account.id:
            raise HTTPException(status_code=403, detail="Plan gehört zu einem anderen Account")
        if plan.planning_period_id is None:
            plan.planning_period_id = period.id
            self.session.add(plan)
            self.session.commit()
            self.session.refresh(plan)
        elif plan.planning_period_id != period.id:
            raise HTTPException(status_code=403, detail="Plan gehört zu einer anderen Planungsperiode")
        return plan
