from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from ..models import (
    Class,
    Requirement,
    Subject,
    Teacher,
    RequirementConfigSourceEnum,
)
from ..services.accounts import resolve_account
from ..services.subject_config import apply_subject_defaults


router = APIRouter(prefix="/requirements", tags=["requirements"])


@router.get("", response_model=List[Requirement])
def list_requirements(
    version_id: Optional[int] = None,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> List[Requirement]:
    account = resolve_account(session, account_id)
    stmt = select(Requirement).where(Requirement.account_id == account.id)
    if version_id is not None:
        stmt = stmt.where(Requirement.version_id == version_id)
    return session.exec(stmt).all()


@router.post("", response_model=Requirement)
def create_requirement(
    req: Requirement,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> Requirement:
    account = resolve_account(session, account_id)
    # validate FKs
    cls = session.get(Class, req.class_id)
    if not cls or cls.account_id != account.id:
        raise HTTPException(status_code=400, detail="class_id invalid")
    subject = session.get(Subject, req.subject_id)
    if not subject or subject.account_id != account.id:
        raise HTTPException(status_code=400, detail="subject_id invalid")
    teacher = session.get(Teacher, req.teacher_id)
    if not teacher or teacher.account_id != account.id:
        raise HTTPException(status_code=400, detail="teacher_id invalid")
    if isinstance(req.config_source, str):
        try:
            req.config_source = RequirementConfigSourceEnum(req.config_source)
        except ValueError:
            raise HTTPException(status_code=400, detail="config_source invalid")
    req.account_id = account.id
    if req.config_source != RequirementConfigSourceEnum.manual:
        apply_subject_defaults(session, req)
    session.add(req)
    session.commit()
    session.refresh(req)
    return req


@router.put("/{req_id}", response_model=Requirement)
def update_requirement(
    req_id: int,
    payload: Requirement,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> Requirement:
    account = resolve_account(session, account_id)
    r = session.get(Requirement, req_id)
    if not r:
        raise HTTPException(status_code=404, detail="requirement not found")
    if r.account_id != account.id:
        raise HTTPException(status_code=403, detail="requirement belongs to different account")
    # partial update
    if payload.class_id:
        cls = session.get(Class, payload.class_id)
        if not cls or cls.account_id != account.id:
            raise HTTPException(status_code=400, detail="class_id invalid")
        r.class_id = payload.class_id
    if payload.subject_id:
        subject = session.get(Subject, payload.subject_id)
        if not subject or subject.account_id != account.id:
            raise HTTPException(status_code=400, detail="subject_id invalid")
        r.subject_id = payload.subject_id
    if payload.teacher_id:
        teacher = session.get(Teacher, payload.teacher_id)
        if not teacher or teacher.account_id != account.id:
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
def delete_requirement(
    req_id: int,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> dict:
    account = resolve_account(session, account_id)
    r = session.get(Requirement, req_id)
    if not r:
        raise HTTPException(status_code=404, detail="requirement not found")
    if r.account_id != account.id:
        raise HTTPException(status_code=403, detail="requirement belongs to different account")
    session.delete(r)
    session.commit()
    return {"ok": True}
