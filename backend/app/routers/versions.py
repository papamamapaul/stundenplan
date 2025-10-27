from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from ..models import DistributionVersion
from ..services.accounts import resolve_account


router = APIRouter(prefix="/versions", tags=["versions"])


@router.get("", response_model=List[DistributionVersion])
def list_versions(
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> List[DistributionVersion]:
    account = resolve_account(session, account_id)
    return session.exec(
        select(DistributionVersion)
        .where(DistributionVersion.account_id == account.id)
        .order_by(DistributionVersion.created_at)
    ).all()


@router.post("", response_model=DistributionVersion)
def create_version(
    payload: DistributionVersion,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> DistributionVersion:
    account = resolve_account(session, account_id)
    if not payload.name:
        raise HTTPException(status_code=400, detail="name required")
    exists = session.exec(
        select(DistributionVersion).where(
            DistributionVersion.account_id == account.id,
            DistributionVersion.name == payload.name,
        )
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="name already exists")
    v = DistributionVersion(name=payload.name, comment=payload.comment, account_id=account.id)
    session.add(v)
    session.commit()
    session.refresh(v)
    return v


@router.put("/{version_id}", response_model=DistributionVersion)
def update_version(
    version_id: int,
    payload: DistributionVersion,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> DistributionVersion:
    account = resolve_account(session, account_id)
    v = session.get(DistributionVersion, version_id)
    if not v:
        raise HTTPException(status_code=404, detail="version not found")
    if v.account_id != account.id:
        raise HTTPException(status_code=403, detail="version belongs to different account")
    if payload.name:
        other = session.exec(
            select(DistributionVersion).where(
                DistributionVersion.account_id == account.id,
                DistributionVersion.name == payload.name,
                DistributionVersion.id != version_id,
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
    session: Session = Depends(get_session),
) -> dict:
    account = resolve_account(session, account_id)
    v = session.get(DistributionVersion, version_id)
    if not v:
        raise HTTPException(status_code=404, detail="version not found")
    if v.account_id != account.id:
        raise HTTPException(status_code=403, detail="version belongs to different account")
    session.delete(v)
    session.commit()
    return {"ok": True}
