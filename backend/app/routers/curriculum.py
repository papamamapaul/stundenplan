from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlmodel import Session, select

from ..core.security import require_active_user
from ..database import get_session
from ..models import Class, ClassSubject, Subject, RequirementParticipationEnum, DoppelstundeEnum, NachmittagEnum
from ..domain.accounts.service import resolve_account, resolve_planning_period
from ..services.subject_config import sync_requirements_for_class_subject


router = APIRouter(prefix="/curriculum", tags=["curriculum"], dependencies=[Depends(require_active_user)])


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
    if "planning_period_id" not in columns:
        session.exec(text("ALTER TABLE classsubject ADD COLUMN planning_period_id INTEGER"))
        session.commit()


@router.get("", response_model=List[ClassSubject])
def list_curriculum(
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> List[ClassSubject]:
    _ensure_curriculum_columns(session)
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    stmt = select(ClassSubject).where(
        ClassSubject.account_id == account.id,
        (ClassSubject.planning_period_id == period.id) | (ClassSubject.planning_period_id == None),  # noqa: E711
    )
    rows = session.exec(stmt).all()
    dirty = False
    filtered: List[ClassSubject] = []
    for row in rows:
        if row.planning_period_id is None:
            row.planning_period_id = period.id
            session.add(row)
            dirty = True
        if row.planning_period_id == period.id:
            filtered.append(row)
    if dirty:
        session.commit()
    return filtered


@router.post("", response_model=ClassSubject)
def create_curriculum(
    item: ClassSubject,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> ClassSubject:
    _ensure_curriculum_columns(session)
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    cls = session.get(Class, item.class_id)
    if not cls or cls.account_id != account.id:
        raise HTTPException(status_code=400, detail="class_id invalid")
    subject = session.get(Subject, item.subject_id)
    if not subject or subject.account_id != account.id:
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
    item.account_id = account.id
    item.planning_period_id = period.id
    session.add(item)
    session.commit()
    session.refresh(item)
    sync_requirements_for_class_subject(
        session,
        account.id,
        item.class_id,
        item.subject_id,
        planning_period_id=period.id,
    )
    return item


@router.put("/{item_id}", response_model=ClassSubject)
def update_curriculum(
    item_id: int,
    payload: ClassSubject,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> ClassSubject:
    _ensure_curriculum_columns(session)
    row = session.get(ClassSubject, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    if row.account_id != account.id:
        raise HTTPException(status_code=403, detail="curriculum entry belongs to different account")
    if row.planning_period_id is None:
        row.planning_period_id = period.id
    elif row.planning_period_id != period.id:
        raise HTTPException(status_code=403, detail="curriculum entry belongs to different planning period")
    if payload.class_id:
        cls = session.get(Class, payload.class_id)
        if not cls or cls.account_id != account.id:
            raise HTTPException(status_code=400, detail="class_id invalid")
        row.class_id = payload.class_id
    if payload.subject_id:
        subject = session.get(Subject, payload.subject_id)
        if not subject or subject.account_id != account.id:
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
    sync_requirements_for_class_subject(
        session,
        account.id,
        row.class_id,
        row.subject_id,
        planning_period_id=row.planning_period_id,
    )
    return row


@router.delete("/{item_id}")
def delete_curriculum(
    item_id: int,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> dict:
    row = session.get(ClassSubject, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    if row.account_id != account.id:
        raise HTTPException(status_code=403, detail="curriculum entry belongs to different account")
    if row.planning_period_id not in (None, period.id):
        raise HTTPException(status_code=403, detail="curriculum entry belongs to different planning period")
    class_id = row.class_id
    subject_id = row.subject_id
    session.delete(row)
    session.commit()
    sync_requirements_for_class_subject(
        session,
        account.id,
        class_id,
        subject_id,
        planning_period_id=period.id,
    )
    return {"ok": True}
