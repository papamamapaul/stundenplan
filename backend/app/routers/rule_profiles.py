from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import RuleProfile


router = APIRouter(prefix="/rule-profiles", tags=["rule-profiles"])


@router.get("", response_model=List[RuleProfile])
def list_profiles(session: Session = Depends(get_session)) -> List[RuleProfile]:
    return session.exec(select(RuleProfile)).all()


@router.get("/{profile_id}", response_model=RuleProfile)
def get_profile(profile_id: int, session: Session = Depends(get_session)) -> RuleProfile:
    p = session.get(RuleProfile, profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="not found")
    return p


@router.post("", response_model=RuleProfile)
def create_profile(profile: RuleProfile, session: Session = Depends(get_session)) -> RuleProfile:
    if not profile.name:
        raise HTTPException(status_code=400, detail="name required")
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


@router.put("/{profile_id}", response_model=RuleProfile)
def update_profile(profile_id: int, payload: RuleProfile, session: Session = Depends(get_session)) -> RuleProfile:
    p = session.get(RuleProfile, profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="not found")
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
def delete_profile(profile_id: int, session: Session = Depends(get_session)) -> dict:
    p = session.get(RuleProfile, profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="not found")
    session.delete(p)
    session.commit()
    return {"ok": True}

