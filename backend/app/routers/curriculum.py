from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import Session, select

from ..database import get_session
from ..models import Class, ClassSubject, Subject, RequirementParticipationEnum


router = APIRouter(prefix="/curriculum", tags=["curriculum"])


def _ensure_curriculum_columns(session: Session) -> None:
    info = session.exec(text("PRAGMA table_info(classsubject)"))
    columns = {row[1] for row in info}
    if "participation" not in columns:
        session.exec(text("ALTER TABLE classsubject ADD COLUMN participation TEXT DEFAULT 'curriculum'"))
        session.commit()


@router.get("", response_model=List[ClassSubject])
def list_curriculum(session: Session = Depends(get_session)) -> List[ClassSubject]:
    _ensure_curriculum_columns(session)
    return session.exec(select(ClassSubject)).all()


@router.post("", response_model=ClassSubject)
def create_curriculum(item: ClassSubject, session: Session = Depends(get_session)) -> ClassSubject:
    _ensure_curriculum_columns(session)
    if not session.get(Class, item.class_id):
        raise HTTPException(status_code=400, detail="class_id invalid")
    if not session.get(Subject, item.subject_id):
        raise HTTPException(status_code=400, detail="subject_id invalid")
    if item.participation is None:
        item.participation = RequirementParticipationEnum.curriculum
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.put("/{item_id}", response_model=ClassSubject)
def update_curriculum(item_id: int, payload: ClassSubject, session: Session = Depends(get_session)) -> ClassSubject:
    _ensure_curriculum_columns(session)
    row = session.get(ClassSubject, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    if payload.class_id:
        if not session.get(Class, payload.class_id):
            raise HTTPException(status_code=400, detail="class_id invalid")
        row.class_id = payload.class_id
    if payload.subject_id:
        if not session.get(Subject, payload.subject_id):
            raise HTTPException(status_code=400, detail="subject_id invalid")
        row.subject_id = payload.subject_id
    if payload.wochenstunden is not None:
        row.wochenstunden = payload.wochenstunden
    fields_set = getattr(payload, "__fields_set__", set())
    if "participation" in fields_set and payload.participation is not None:
        row.participation = payload.participation
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/{item_id}")
def delete_curriculum(item_id: int, session: Session = Depends(get_session)) -> dict:
    row = session.get(ClassSubject, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    session.delete(row)
    session.commit()
    return {"ok": True}
