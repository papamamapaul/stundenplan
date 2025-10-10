from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..database import get_session
from ..models import BasisPlan
from ..schemas import BasisPlanData, BasisPlanOut, BasisPlanUpdate


router = APIRouter(prefix="/basisplan", tags=["basisplan"])

DEFAULT_META: Dict[str, Any] = {"version": 1}


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


def _ensure_row(session: Session) -> BasisPlan:
    row = session.exec(select(BasisPlan)).first()
    if not row:
        row = BasisPlan(name="Basisplan", data=None)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


@router.get("", response_model=BasisPlanOut)
def get_basisplan(session: Session = Depends(get_session)) -> BasisPlanOut:
    row = _ensure_row(session)
    data = _load_data(row)
    return BasisPlanOut(id=row.id, name=row.name, data=data, updated_at=row.updated_at)


@router.put("", response_model=BasisPlanOut)
def update_basisplan(payload: BasisPlanUpdate, session: Session = Depends(get_session)) -> BasisPlanOut:
    row = _ensure_row(session)
    if payload.name:
        row.name = payload.name
    if payload.data is not None:
        data_dict = payload.data.dict()
        row.data = json.dumps(data_dict)
    else:
        # keep existing data if client omitted payload
        if row.data is None:
            row.data = json.dumps(BasisPlanData().dict())
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    data = _load_data(row)
    return BasisPlanOut(id=row.id, name=row.name, data=data, updated_at=row.updated_at)
