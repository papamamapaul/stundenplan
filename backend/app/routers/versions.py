from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..core.security import require_active_user
from ..database import get_session
from ..models import DistributionVersion
from ..domain.accounts.service import resolve_account, resolve_planning_period
from sqlalchemy import text


router = APIRouter(prefix="/versions", tags=["versions"], dependencies=[Depends(require_active_user)])


def _ensure_version_columns(session: Session) -> None:
    info = session.exec(text("PRAGMA table_info(distributionversion)"))
    columns = {row[1] for row in info}
    if "planning_period_id" not in columns:
        session.exec(text("ALTER TABLE distributionversion ADD COLUMN planning_period_id INTEGER"))
        session.commit()


@router.get("", response_model=List[DistributionVersion])
def list_versions(
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> List[DistributionVersion]:
    _ensure_version_columns(session)
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    stmt = (
        select(DistributionVersion)
        .where(DistributionVersion.account_id == account.id)
        .where(
            (DistributionVersion.planning_period_id == period.id)
            | (DistributionVersion.planning_period_id == None)  # noqa: E711
        )
        .order_by(DistributionVersion.created_at)
    )
    rows = session.exec(stmt).all()
    return rows


@router.post("", response_model=DistributionVersion)
def create_version(
    payload: DistributionVersion,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> DistributionVersion:
    _ensure_version_columns(session)
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    if not payload.name:
        raise HTTPException(status_code=400, detail="name required")
    exists = session.exec(
        select(DistributionVersion).where(
            DistributionVersion.account_id == account.id,
            DistributionVersion.name == payload.name,
            (DistributionVersion.planning_period_id == period.id)
            | (DistributionVersion.planning_period_id == None),  # noqa: E711
        )
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="name already exists")
    v = DistributionVersion(
        name=payload.name,
        comment=payload.comment,
        account_id=account.id,
        planning_period_id=period.id,
    )
    session.add(v)
    session.commit()
    session.refresh(v)
    return v


@router.put("/{version_id}", response_model=DistributionVersion)
def update_version(
    version_id: int,
    payload: DistributionVersion,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> DistributionVersion:
    _ensure_version_columns(session)
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    v = session.get(DistributionVersion, version_id)
    if not v:
        raise HTTPException(status_code=404, detail="version not found")
    if v.account_id != account.id:
        raise HTTPException(status_code=403, detail="version belongs to different account")
    if v.planning_period_id not in (None, period.id):
        raise HTTPException(status_code=403, detail="version belongs to different planning period")
    if v.planning_period_id is None:
        v.planning_period_id = period.id
    if payload.name:
        other = session.exec(
            select(DistributionVersion).where(
                DistributionVersion.account_id == account.id,
                DistributionVersion.name == payload.name,
                DistributionVersion.id != version_id,
                (DistributionVersion.planning_period_id == period.id)
                | (DistributionVersion.planning_period_id == None),  # noqa: E711
            )
        ).first()
        if other:
            raise HTTPException(status_code=400, detail="name already exists")
        v.name = payload.name
    if payload.comment is not None:
        v.comment = payload.comment
    session.add(v)
    session.commit()
    session.refresh(v)
    return v


@router.delete("/{version_id}")
def delete_version(
    version_id: int,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> dict:
    _ensure_version_columns(session)
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    v = session.get(DistributionVersion, version_id)
    if not v:
        raise HTTPException(status_code=404, detail="version not found")
    if v.account_id != account.id:
        raise HTTPException(status_code=403, detail="version belongs to different account")
    if v.planning_period_id not in (None, period.id):
        raise HTTPException(status_code=403, detail="version belongs to different planning period")
    session.delete(v)
    session.commit()
    return {"ok": True}
