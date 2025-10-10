from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import Class, Subject, Teacher, Room


router = APIRouter(prefix="", tags=["masterdata"])


@router.get("/teachers", response_model=List[Teacher])
def list_teachers(session: Session = Depends(get_session)) -> List[Teacher]:
    return session.exec(select(Teacher)).all()


@router.post("/teachers", response_model=Teacher)
def create_teacher(payload: Teacher, session: Session = Depends(get_session)) -> Teacher:
    # Mandatory: kuerzel and deputat
    if not payload.kuerzel or (payload.deputat is None):
        raise HTTPException(status_code=400, detail="kuerzel and deputat are required")
    # Ensure name
    if not payload.name:
        # compute name from first/last if provided, otherwise use kuerzel as fallback
        if payload.first_name or payload.last_name:
            payload.name = f"{payload.first_name or ''} {payload.last_name or ''}".strip()
        else:
            payload.name = str(payload.kuerzel)
    t = Teacher(
        name=payload.name,
        kuerzel=payload.kuerzel,
        deputat_soll=payload.deputat_soll,
        first_name=payload.first_name,
        last_name=payload.last_name,
        deputat=payload.deputat,
        work_mo=payload.work_mo if payload.work_mo is not None else True,
        work_di=payload.work_di if payload.work_di is not None else True,
        work_mi=payload.work_mi if payload.work_mi is not None else True,
        work_do=payload.work_do if payload.work_do is not None else True,
        work_fr=payload.work_fr if payload.work_fr is not None else True,
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return t


@router.put("/teachers/{teacher_id}", response_model=Teacher)
def update_teacher(teacher_id: int, payload: Teacher, session: Session = Depends(get_session)) -> Teacher:
    t = session.get(Teacher, teacher_id)
    if not t:
        raise HTTPException(status_code=404, detail="teacher not found")
    if payload.name:
        t.name = payload.name
    if payload.first_name is not None:
        t.first_name = payload.first_name
    if payload.last_name is not None:
        t.last_name = payload.last_name
    if (payload.first_name or payload.last_name) and not payload.name:
        # recompute composite name if explicit name not provided
        t.name = f"{t.first_name or ''} {t.last_name or ''}".strip() or t.name
    if payload.kuerzel is not None:
        t.kuerzel = payload.kuerzel
    if payload.deputat_soll is not None:
        t.deputat_soll = payload.deputat_soll
    if payload.deputat is not None:
        t.deputat = payload.deputat
    if payload.work_mo is not None:
        t.work_mo = payload.work_mo
    if payload.work_di is not None:
        t.work_di = payload.work_di
    if payload.work_mi is not None:
        t.work_mi = payload.work_mi
    if payload.work_do is not None:
        t.work_do = payload.work_do
    if payload.work_fr is not None:
        t.work_fr = payload.work_fr
    # Ensure name present; if empty, fallback to kuerzel
    if not t.name or not t.name.strip():
        t.name = t.kuerzel or t.name
    # Validate mandatory fields after update
    if (t.kuerzel is None or str(t.kuerzel).strip() == "") or (t.deputat is None):
        raise HTTPException(status_code=400, detail="kuerzel and deputat are required")

    session.add(t)
    session.commit()
    session.refresh(t)
    return t


@router.delete("/teachers/{teacher_id}")
def delete_teacher(teacher_id: int, session: Session = Depends(get_session)) -> dict:
    t = session.get(Teacher, teacher_id)
    if not t:
        raise HTTPException(status_code=404, detail="teacher not found")
    session.delete(t)
    session.commit()
    return {"ok": True}


@router.get("/classes", response_model=List[Class])
def list_classes(session: Session = Depends(get_session)) -> List[Class]:
    return session.exec(select(Class)).all()


@router.post("/classes", response_model=Class)
def create_class(payload: Class, session: Session = Depends(get_session)) -> Class:
    if not payload.name:
        raise HTTPException(status_code=400, detail="name required")
    c = Class(name=payload.name, homeroom_teacher_id=payload.homeroom_teacher_id)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@router.put("/classes/{class_id}", response_model=Class)
def update_class(class_id: int, payload: Class, session: Session = Depends(get_session)) -> Class:
    c = session.get(Class, class_id)
    if not c:
        raise HTTPException(status_code=404, detail="class not found")
    if payload.name:
        c.name = payload.name
    if payload.homeroom_teacher_id is not None:
        c.homeroom_teacher_id = payload.homeroom_teacher_id
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@router.delete("/classes/{class_id}")
def delete_class(class_id: int, session: Session = Depends(get_session)) -> dict:
    c = session.get(Class, class_id)
    if not c:
        raise HTTPException(status_code=404, detail="class not found")
    session.delete(c)
    session.commit()
    return {"ok": True}


@router.get("/subjects", response_model=List[Subject])
def list_subjects(session: Session = Depends(get_session)) -> List[Subject]:
    return session.exec(select(Subject)).all()


@router.post("/subjects", response_model=Subject)
def create_subject(payload: Subject, session: Session = Depends(get_session)) -> Subject:
    if not payload.name:
        raise HTTPException(status_code=400, detail="name required")
    if payload.required_room_id is not None:
        if payload.required_room_id and not session.get(Room, payload.required_room_id):
            raise HTTPException(status_code=400, detail="required room not found")
    s = Subject(
        name=payload.name,
        kuerzel=payload.kuerzel,
        color=payload.color,
        required_room_id=payload.required_room_id,
        default_doppelstunde=payload.default_doppelstunde,
        default_nachmittag=payload.default_nachmittag,
    )
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


@router.put("/subjects/{subject_id}", response_model=Subject)
def update_subject(subject_id: int, payload: Subject, session: Session = Depends(get_session)) -> Subject:
    s = session.get(Subject, subject_id)
    if not s:
        raise HTTPException(status_code=404, detail="subject not found")
    if payload.name:
        s.name = payload.name
    if payload.kuerzel is not None:
        s.kuerzel = payload.kuerzel
    if payload.color is not None:
        s.color = payload.color
    payload_data = payload.dict(exclude_unset=True)
    if "required_room_id" in payload_data:
        rid = payload_data["required_room_id"]
        if rid and not session.get(Room, rid):
            raise HTTPException(status_code=400, detail="required room not found")
        s.required_room_id = rid
    if payload.default_doppelstunde is not None:
        s.default_doppelstunde = payload.default_doppelstunde
    if payload.default_nachmittag is not None:
        s.default_nachmittag = payload.default_nachmittag
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


@router.delete("/subjects/{subject_id}")
def delete_subject(subject_id: int, session: Session = Depends(get_session)) -> dict:
    s = session.get(Subject, subject_id)
    if not s:
        raise HTTPException(status_code=404, detail="subject not found")
    session.delete(s)
    session.commit()
    return {"ok": True}
