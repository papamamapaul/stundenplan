from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from ..core.security import require_active_user, require_admin_user
from ..database import get_session
from ..models import BasisPlan
from ..schemas import BasisPlanData, BasisPlanOut, BasisPlanUpdate, BasisPlanPreviewRequest
from ..domain.accounts.service import resolve_account, resolve_planning_period
from ..domain.planner.basis_parser import BasisPlanParser
from ..domain.planner.data_access import fetch_requirements_dataframe
from ..models import Class as ClassModel, Subject as SubjectModel
from sqlalchemy import text


router = APIRouter(prefix="/basisplan", tags=["basisplan"], dependencies=[Depends(require_active_user)])

DEFAULT_META: Dict[str, Any] = {"version": 1}


def _ensure_basisplan_columns(session: Session) -> None:
    info = session.exec(text("PRAGMA table_info(basisplan)"))
    columns = {row[1] for row in info}
    if "planning_period_id" not in columns:
        session.exec(text("ALTER TABLE basisplan ADD COLUMN planning_period_id INTEGER"))
        session.commit()


def _load_data(row: BasisPlan) -> BasisPlanData:
    raw: Dict[str, Any] = {}
    if row.data:
        try:
            raw = json.loads(row.data)
        except json.JSONDecodeError:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    raw.setdefault("meta", DEFAULT_META.copy())
    raw.setdefault("classes", {})
    raw.setdefault("rooms", {})
    raw.setdefault("windows", {})
    return BasisPlanData(**raw)


def _ensure_row(session: Session, account_id: int, planning_period_id: int) -> BasisPlan:
    row = session.exec(
        select(BasisPlan).where(
            BasisPlan.account_id == account_id,
            BasisPlan.planning_period_id == planning_period_id,
        )
    ).first()
    if not row:
        legacy = session.exec(
            select(BasisPlan).where(
                BasisPlan.account_id == account_id,
                BasisPlan.planning_period_id == None,  # noqa: E711
            )
        ).first()
        if legacy:
            legacy.planning_period_id = planning_period_id
            session.add(legacy)
            session.commit()
            session.refresh(legacy)
            row = legacy
        else:
            row = BasisPlan(name="Basisplan", data=None, account_id=account_id, planning_period_id=planning_period_id)
            session.add(row)
            session.commit()
            session.refresh(row)
    return row


@router.get("", response_model=BasisPlanOut)
def get_basisplan(
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> BasisPlanOut:
    _ensure_basisplan_columns(session)
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    row = _ensure_row(session, account.id, period.id)
    data = _load_data(row)
    return BasisPlanOut(
        id=row.id,
        name=row.name,
        data=data,
        updated_at=row.updated_at,
        planning_period_id=row.planning_period_id,
    )


@router.put("", response_model=BasisPlanOut)
def update_basisplan(
    payload: BasisPlanUpdate,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> BasisPlanOut:
    _ensure_basisplan_columns(session)
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    row = _ensure_row(session, account.id, period.id)
    payload_data = payload.model_dump(exclude_unset=True)
    if "name" in payload_data and payload_data["name"]:
        row.name = payload_data["name"]
    if "data" in payload_data and payload_data["data"] is not None:
        row.data = json.dumps(payload_data["data"])
    elif row.data is None:
        row.data = json.dumps(BasisPlanData().model_dump())
    row.updated_at = datetime.now(timezone.utc)
    row.planning_period_id = period.id
    session.add(row)
    session.commit()
    session.refresh(row)
    data = _load_data(row)
    return BasisPlanOut(
        id=row.id,
        name=row.name,
        data=data,
        updated_at=row.updated_at,
        planning_period_id=row.planning_period_id,
    )


@router.post("/debug/parse")
def preview_basisplan(
    body: BasisPlanPreviewRequest | None = None,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_user),
) -> dict:
    """Admin-only helper that returns the parsed BasisPlanContext for tooling/preview."""
    _ensure_basisplan_columns(session)
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    row = _ensure_row(session, account.id, period.id)
    df, FACH_ID, _, _, _, _ = fetch_requirements_dataframe(
        session,
        account_id=account.id,
        planning_period_id=period.id,
        version_id=None,
    )
    if df is None or df.empty:
        df = pd.DataFrame(columns=["Klasse", "Fach", "Lehrer", "Wochenstunden"])
        FACH_ID = []
    subject_rows = session.exec(select(SubjectModel).where(SubjectModel.account_id == account.id)).all()
    class_rows = session.exec(select(ClassModel).where(ClassModel.account_id == account.id)).all()
    subject_id_to_name = {row.id: row.name for row in subject_rows}
    class_id_to_name = {row.id: row.name for row in class_rows}
    parser = BasisPlanParser(session)
    payload_dict = body.payload.model_dump() if body and body.payload else _load_data(row).model_dump()
    context = parser.parse_from_payload(payload_dict, df, FACH_ID, class_id_to_name, subject_id_to_name)
    return _serialize_context(context)


def _serialize_context(context) -> dict:
    def _convert(value):
        if isinstance(value, set):
            return sorted(value)
        if isinstance(value, dict):
            return {k: _convert(v) for k, v in value.items()}
        if isinstance(value, list):
            return [_convert(v) for v in value]
        return value

    return {
        "room_plan": context.room_plan,
        "class_windows": context.class_windows_by_name,
        "class_fixed_lookup": _convert(context.class_fixed_lookup),
        "flexible_slot_lookup": _convert(context.flexible_slot_lookup),
        "flexible_slot_limits": _convert(context.flexible_slot_limits),
        "flexible_groups": context.flexible_groups,
        "fixed_slot_map": _convert(context.fixed_slot_map),
        "slots_per_day": context.slots_per_day,
        "pause_slots": _convert(context.pause_slots),
        "slots_meta": [slot.model_dump() for slot in context.slots_meta],
    }
