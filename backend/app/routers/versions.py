from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import DistributionVersion


router = APIRouter(prefix="/versions", tags=["versions"])


@router.get("", response_model=List[DistributionVersion])
def list_versions(session: Session = Depends(get_session)) -> List[DistributionVersion]:
    return session.exec(select(DistributionVersion).order_by(DistributionVersion.created_at)).all()


@router.post("", response_model=DistributionVersion)
def create_version(payload: DistributionVersion, session: Session = Depends(get_session)) -> DistributionVersion:
    if not payload.name:
        raise HTTPException(status_code=400, detail="name required")
    exists = session.exec(select(DistributionVersion).where(DistributionVersion.name == payload.name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="name already exists")
    v = DistributionVersion(name=payload.name, comment=payload.comment)
    session.add(v)
    session.commit()
    session.refresh(v)
    return v


@router.put("/{version_id}", response_model=DistributionVersion)
def update_version(version_id: int, payload: DistributionVersion, session: Session = Depends(get_session)) -> DistributionVersion:
    v = session.get(DistributionVersion, version_id)
    if not v:
        raise HTTPException(status_code=404, detail="version not found")
    if payload.name:
        other = session.exec(select(DistributionVersion).where(DistributionVersion.name == payload.name, DistributionVersion.id != version_id)).first()
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
def delete_version(version_id: int, session: Session = Depends(get_session)) -> dict:
    v = session.get(DistributionVersion, version_id)
    if not v:
        raise HTTPException(status_code=404, detail="version not found")
    session.delete(v)
    session.commit()
    return {"ok": True}

