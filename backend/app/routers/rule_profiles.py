from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..core.security import require_active_user
from ..database import get_session
from ..models import RuleProfile
from ..domain.accounts.service import resolve_account


router = APIRouter(prefix="/rule-profiles", tags=["rule-profiles"], dependencies=[Depends(require_active_user)])


@router.get("", response_model=List[RuleProfile])
def list_profiles(
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> List[RuleProfile]:
    account = resolve_account(session, account_id)
    return session.exec(select(RuleProfile).where(RuleProfile.account_id == account.id)).all()


@router.get("/{profile_id}", response_model=RuleProfile)
def get_profile(
    profile_id: int,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> RuleProfile:
    account = resolve_account(session, account_id)
    p = session.get(RuleProfile, profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="not found")
    if p.account_id != account.id:
        raise HTTPException(status_code=403, detail="rule profile belongs to different account")
    return p


@router.post("", response_model=RuleProfile)
def create_profile(
    profile: RuleProfile,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> RuleProfile:
    account = resolve_account(session, account_id)
    if not profile.name:
        raise HTTPException(status_code=400, detail="name required")
    profile.account_id = account.id
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


@router.put("/{profile_id}", response_model=RuleProfile)
def update_profile(
    profile_id: int,
    payload: RuleProfile,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> RuleProfile:
    account = resolve_account(session, account_id)
    p = session.get(RuleProfile, profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="not found")
    if p.account_id != account.id:
        raise HTTPException(status_code=403, detail="rule profile belongs to different account")
    data = payload.dict(exclude_unset=True)
    for k, v in data.items():
        if k == "id" or v is None:
            continue
        setattr(p, k, v)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


@router.delete("/{profile_id}")
def delete_profile(
    profile_id: int,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> dict:
    account = resolve_account(session, account_id)
    p = session.get(RuleProfile, profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="not found")
    if p.account_id != account.id:
        raise HTTPException(status_code=403, detail="rule profile belongs to different account")
    session.delete(p)
    session.commit()
    return {"ok": True}
