from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import (
    Class,
    Requirement,
    Subject,
    Teacher,
    RequirementConfigSourceEnum,
)
from ..services.subject_config import apply_subject_defaults


router = APIRouter(prefix="/requirements", tags=["requirements"])


@router.get("", response_model=List[Requirement])
def list_requirements(version_id: Optional[int] = None, session: Session = Depends(get_session)) -> List[Requirement]:
    stmt = select(Requirement)
    if version_id is not None:
        stmt = stmt.where(Requirement.version_id == version_id)
    return session.exec(stmt).all()


@router.post("", response_model=Requirement)
def create_requirement(req: Requirement, session: Session = Depends(get_session)) -> Requirement:
    # validate FKs
    if not session.get(Class, req.class_id):
        raise HTTPException(status_code=400, detail="class_id invalid")
    if not session.get(Subject, req.subject_id):
        raise HTTPException(status_code=400, detail="subject_id invalid")
    if not session.get(Teacher, req.teacher_id):
        raise HTTPException(status_code=400, detail="teacher_id invalid")
    if isinstance(req.config_source, str):
        try:
            req.config_source = RequirementConfigSourceEnum(req.config_source)
        except ValueError:
            raise HTTPException(status_code=400, detail="config_source invalid")
    if req.config_source != RequirementConfigSourceEnum.manual:
        apply_subject_defaults(session, req)
    session.add(req)
    session.commit()
    session.refresh(req)
    return req


@router.put("/{req_id}", response_model=Requirement)
def update_requirement(req_id: int, payload: Requirement, session: Session = Depends(get_session)) -> Requirement:
    r = session.get(Requirement, req_id)
    if not r:
        raise HTTPException(status_code=404, detail="requirement not found")
    # partial update
    if payload.class_id:
        if not session.get(Class, payload.class_id):
            raise HTTPException(status_code=400, detail="class_id invalid")
        r.class_id = payload.class_id
    if payload.subject_id:
        if not session.get(Subject, payload.subject_id):
            raise HTTPException(status_code=400, detail="subject_id invalid")
        r.subject_id = payload.subject_id
    if payload.teacher_id:
        if not session.get(Teacher, payload.teacher_id):
            raise HTTPException(status_code=400, detail="teacher_id invalid")
        r.teacher_id = payload.teacher_id
    if payload.wochenstunden is not None:
        r.wochenstunden = payload.wochenstunden
    fields_set = getattr(payload, "__fields_set__", set())
    if "participation" in fields_set and payload.participation is not None:
        r.participation = payload.participation
    if "config_source" in fields_set and payload.config_source is not None:
        new_source = payload.config_source
        if isinstance(new_source, str):
            try:
                new_source = RequirementConfigSourceEnum(new_source)
            except ValueError:
                raise HTTPException(status_code=400, detail="config_source invalid")
        r.config_source = new_source
    if r.config_source != RequirementConfigSourceEnum.manual:
        apply_subject_defaults(session, r)
    else:
        if payload.doppelstunde is not None:
            r.doppelstunde = payload.doppelstunde
        if payload.nachmittag is not None:
            r.nachmittag = payload.nachmittag
    session.add(r)
    session.commit()
    session.refresh(r)
    return r


@router.delete("/{req_id}")
def delete_requirement(req_id: int, session: Session = Depends(get_session)) -> dict:
    r = session.get(Requirement, req_id)
    if not r:
        raise HTTPException(status_code=404, detail="requirement not found")
    session.delete(r)
    session.commit()
    return {"ok": True}
