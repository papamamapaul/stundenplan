from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from ..core.security import require_active_user
from ..database import get_session
from ..models import SchoolSettings
from ..schemas import SchoolSettingsOut, SchoolSettingsUpdate, SlotDefinition
from ..domain.accounts.service import resolve_account


router = APIRouter(prefix="/settings/school", tags=["school-settings"], dependencies=[Depends(require_active_user)])

DEFAULT_DAYS = ["Mo", "Di", "Mi", "Do", "Fr"]
DEFAULT_SLOTS = [
    {"label": "1. Stunde", "start": "08:00", "end": "08:45", "is_pause": False},
    {"label": "2. Stunde", "start": "08:50", "end": "09:35", "is_pause": False},
    {"label": "Pause", "start": "09:35", "end": "09:50", "is_pause": True},
    {"label": "3. Stunde", "start": "09:50", "end": "10:35", "is_pause": False},
    {"label": "4. Stunde", "start": "10:40", "end": "11:25", "is_pause": False},
    {"label": "5. Stunde", "start": "11:30", "end": "12:15", "is_pause": False},
]


def _ensure_settings(session: Session, account_id: int) -> SchoolSettings:
    row = session.exec(
        select(SchoolSettings).where(SchoolSettings.account_id == account_id)
    ).first()
    if row:
        return row
    row = SchoolSettings(
        account_id=account_id,
        name="Neue Schule",
        default_days=json.dumps(DEFAULT_DAYS),
        default_slots=json.dumps(DEFAULT_SLOTS),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _load_days(raw: Optional[str]) -> List[str]:
    if not raw:
        return list(DEFAULT_DAYS)
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(item) for item in data if str(item).strip()]
    except json.JSONDecodeError:
        pass
    return list(DEFAULT_DAYS)


def _load_slots(raw: Optional[str]) -> List[Dict[str, Any]]:
    if not raw:
        return list(DEFAULT_SLOTS)
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            cleaned: List[Dict[str, Any]] = []
            for item in data:
                if not isinstance(item, dict):
                    continue
                cleaned.append(
                    {
                        "label": str(item.get("label") or "Slot"),
                        "start": item.get("start"),
                        "end": item.get("end"),
                        "is_pause": bool(item.get("is_pause")),
                    }
                )
            if cleaned:
                return cleaned
    except json.JSONDecodeError:
        pass
    return list(DEFAULT_SLOTS)


def _serialize(row: SchoolSettings) -> SchoolSettingsOut:
    return SchoolSettingsOut(
        account_id=row.account_id,
        name=row.name,
        short_name=row.short_name,
        street=row.street,
        postal_code=row.postal_code,
        city=row.city,
        school_type=row.school_type,
        organization_type=row.organization_type,
        phone=row.phone,
        email=row.email,
        default_days=_load_days(row.default_days),
        default_slots=[SlotDefinition(**slot) for slot in _load_slots(row.default_slots)],
    )


@router.get("", response_model=SchoolSettingsOut)
def get_school_settings(
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> SchoolSettingsOut:
    account = resolve_account(session, account_id)
    row = _ensure_settings(session, account.id)
    return _serialize(row)


@router.put("", response_model=SchoolSettingsOut)
def update_school_settings(
    payload: SchoolSettingsUpdate,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> SchoolSettingsOut:
    account = resolve_account(session, account_id)
    row = _ensure_settings(session, account.id)
    data = payload.dict(exclude_unset=True)
    for key, value in data.items():
        if key in {"default_days", "default_slots"}:
            continue
        setattr(row, key, value)
    if "default_days" in data:
        days = [day for day in (data["default_days"] or []) if day]
        row.default_days = json.dumps(days or DEFAULT_DAYS)
    if "default_slots" in data:
        slots_payload = data["default_slots"] or []
        normalized = [
            {
                "label": slot.label,
                "start": slot.start,
                "end": slot.end,
                "is_pause": slot.is_pause,
            }
            for slot in slots_payload
        ]
        row.default_slots = json.dumps(normalized or DEFAULT_SLOTS)
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _serialize(row)
