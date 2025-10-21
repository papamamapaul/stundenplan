from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import Session, select

from ..database import get_session
from ..models import Class, ClassSubject, Subject, RequirementParticipationEnum, DoppelstundeEnum, NachmittagEnum
from ..services.subject_config import sync_requirements_for_class_subject


router = APIRouter(prefix="/curriculum", tags=["curriculum"])


def _ensure_curriculum_columns(session: Session) -> None:
    info = session.exec(text("PRAGMA table_info(classsubject)"))
    columns = {row[1] for row in info}
    if "participation" not in columns:
        session.exec(text("ALTER TABLE classsubject ADD COLUMN participation TEXT DEFAULT 'curriculum'"))
        session.commit()
        columns.add("participation")
    if "doppelstunde" not in columns:
        session.exec(text("ALTER TABLE classsubject ADD COLUMN doppelstunde TEXT"))
        session.commit()
        columns.add("doppelstunde")
    if "nachmittag" not in columns:
        session.exec(text("ALTER TABLE classsubject ADD COLUMN nachmittag TEXT"))
        session.commit()
        columns.add("nachmittag")


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
    if item.doppelstunde is not None and not isinstance(item.doppelstunde, DoppelstundeEnum):
        try:
            item.doppelstunde = DoppelstundeEnum(item.doppelstunde)
        except ValueError:
            raise HTTPException(status_code=400, detail="unknown doppelstunde option")
    if item.nachmittag is not None and not isinstance(item.nachmittag, NachmittagEnum):
        try:
            item.nachmittag = NachmittagEnum(item.nachmittag)
        except ValueError:
            raise HTTPException(status_code=400, detail="unknown nachmittag option")
    session.add(item)
    session.commit()
    session.refresh(item)
    sync_requirements_for_class_subject(session, item.class_id, item.subject_id)
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
    if "doppelstunde" in fields_set:
        if payload.doppelstunde in (None, ""):
            row.doppelstunde = None
        elif isinstance(payload.doppelstunde, DoppelstundeEnum):
            row.doppelstunde = payload.doppelstunde
        else:
            try:
                row.doppelstunde = DoppelstundeEnum(payload.doppelstunde)
            except ValueError:
                raise HTTPException(status_code=400, detail="unknown doppelstunde option")
    if "nachmittag" in fields_set:
        if payload.nachmittag in (None, ""):
            row.nachmittag = None
        elif isinstance(payload.nachmittag, NachmittagEnum):
            row.nachmittag = payload.nachmittag
        else:
            try:
                row.nachmittag = NachmittagEnum(payload.nachmittag)
            except ValueError:
                raise HTTPException(status_code=400, detail="unknown nachmittag option")
    session.add(row)
    session.commit()
    session.refresh(row)
    sync_requirements_for_class_subject(session, row.class_id, row.subject_id)
    return row


@router.delete("/{item_id}")
def delete_curriculum(item_id: int, session: Session = Depends(get_session)) -> dict:
    row = session.get(ClassSubject, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    class_id = row.class_id
    subject_id = row.subject_id
    session.delete(row)
    session.commit()
    sync_requirements_for_class_subject(session, class_id, subject_id)
    return {"ok": True}
