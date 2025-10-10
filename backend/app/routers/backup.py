from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from ..models import (
    Class,
    ClassSubject,
    Requirement,
    RuleProfile,
    Subject,
    Teacher,
    Room,
    DoppelstundeEnum,
    NachmittagEnum,
    DistributionVersion,
)
from ..schemas import (
    BackupPayload,
    BackupTeacher,
    BackupClass,
    BackupSubject,
    BackupRoom,
    BackupCurriculumItem,
    BackupRequirementItem,
)


router = APIRouter(prefix="/backup", tags=["backup"])


@router.get("/export", response_model=BackupPayload)
def export_data(session: Session = Depends(get_session)) -> BackupPayload:
    teachers = session.exec(select(Teacher)).all()
    classes = session.exec(select(Class)).all()
    subjects = session.exec(select(Subject)).all()
    rooms = session.exec(select(Room)).all()
    curriculum = session.exec(select(ClassSubject)).all()
    requirements = session.exec(select(Requirement)).all()
    rule_profiles = session.exec(select(RuleProfile)).all()

    # Lookups
    teacher_by_id = {t.id: t for t in teachers}
    class_by_id = {c.id: c for c in classes}
    subject_by_id = {s.id: s for s in subjects}
    room_by_id = {r.id: r for r in rooms}

    out_teachers: List[BackupTeacher] = [
        BackupTeacher(
            name=t.name,
            kuerzel=t.kuerzel,
            deputat_soll=t.deputat_soll,
            first_name=t.first_name,
            last_name=t.last_name,
            deputat=t.deputat,
            work_mo=t.work_mo,
            work_di=t.work_di,
            work_mi=t.work_mi,
            work_do=t.work_do,
            work_fr=t.work_fr,
        )
        for t in teachers
    ]

    out_classes: List[BackupClass] = [
        BackupClass(
            name=c.name,
            homeroom_teacher=(teacher_by_id[c.homeroom_teacher_id].kuerzel if (c.homeroom_teacher_id and teacher_by_id.get(c.homeroom_teacher_id) and teacher_by_id[c.homeroom_teacher_id].kuerzel)
                              else (teacher_by_id[c.homeroom_teacher_id].name if c.homeroom_teacher_id and teacher_by_id.get(c.homeroom_teacher_id) else None))
        )
        for c in classes
    ]

    out_rooms: List[BackupRoom] = [
        BackupRoom(
            name=r.name,
            type=r.type,
            capacity=r.capacity,
            is_classroom=r.is_classroom,
        )
        for r in rooms
    ]

    out_subjects: List[BackupSubject] = [
        BackupSubject(
            name=s.name,
            kuerzel=s.kuerzel,
            color=s.color,
            default_doppelstunde=(s.default_doppelstunde.value if s.default_doppelstunde else None),
            default_nachmittag=(s.default_nachmittag.value if s.default_nachmittag else None),
            required_room=room_by_id[s.required_room_id].name if (s.required_room_id and room_by_id.get(s.required_room_id)) else None,
        )
        for s in subjects
    ]

    out_curriculum: List[BackupCurriculumItem] = [
        BackupCurriculumItem(
            class_name=class_by_id[cs.class_id].name if class_by_id.get(cs.class_id) else str(cs.class_id),
            subject_name=subject_by_id[cs.subject_id].name if subject_by_id.get(cs.subject_id) else str(cs.subject_id),
            wochenstunden=cs.wochenstunden,
        )
        for cs in curriculum
    ]

    out_requirements: List[BackupRequirementItem] = [
        BackupRequirementItem(
            class_name=class_by_id[r.class_id].name if class_by_id.get(r.class_id) else str(r.class_id),
            subject_name=subject_by_id[r.subject_id].name if subject_by_id.get(r.subject_id) else str(r.subject_id),
            teacher_name=teacher_by_id[r.teacher_id].kuerzel or teacher_by_id[r.teacher_id].name if teacher_by_id.get(r.teacher_id) else str(r.teacher_id),
            wochenstunden=r.wochenstunden,
            doppelstunde=r.doppelstunde.value,
            nachmittag=r.nachmittag.value,
        )
        for r in requirements
    ]

    # Rule profiles (dump raw dicts)
    rp_dicts = [rp.dict() for rp in rule_profiles]
    for rp in rp_dicts:
        rp.pop("id", None)

    return BackupPayload(
        teachers=out_teachers,
        classes=out_classes,
        subjects=out_subjects,
        rooms=out_rooms,
        curriculum=out_curriculum,
        requirements=out_requirements,
        rule_profiles=rp_dicts,
    )


@router.post("/import")
def import_data(
    payload: BackupPayload,
    session: Session = Depends(get_session),
    replace: bool = Query(False, description="Bestehende Daten ersetzen (truncate before import)"),
):
    # Optionally clear tables (in dependency order)
    if replace:
        session.query(Requirement).delete()
        session.query(ClassSubject).delete()
        session.query(Subject).delete()
        session.query(Room).delete()
        session.query(Class).delete()
        session.query(Teacher).delete()
        session.query(RuleProfile).delete()
        session.commit()

    # Helper: get-or-create by unique keys
    def upsert_teacher(bt: BackupTeacher) -> Teacher:
        t = None
        if bt.kuerzel:
            t = session.exec(select(Teacher).where(Teacher.kuerzel == bt.kuerzel)).first()
        if not t and bt.name:
            t = session.exec(select(Teacher).where(Teacher.name == bt.name)).first()
        if not t:
            t = Teacher(
                name=bt.name or (bt.kuerzel or "").strip() or None,
                kuerzel=bt.kuerzel,
                deputat_soll=bt.deputat_soll,
                first_name=bt.first_name,
                last_name=bt.last_name,
                deputat=bt.deputat,
                work_mo=bt.work_mo if bt.work_mo is not None else True,
                work_di=bt.work_di if bt.work_di is not None else True,
                work_mi=bt.work_mi if bt.work_mi is not None else True,
                work_do=bt.work_do if bt.work_do is not None else True,
                work_fr=bt.work_fr if bt.work_fr is not None else True,
            )
            session.add(t)
            session.commit(); session.refresh(t)
        else:
            # update basic fields
            t.name = bt.name or t.name
            t.kuerzel = bt.kuerzel or t.kuerzel
            t.deputat_soll = bt.deputat_soll if bt.deputat_soll is not None else t.deputat_soll
            t.first_name = bt.first_name if bt.first_name is not None else t.first_name
            t.last_name = bt.last_name if bt.last_name is not None else t.last_name
            t.deputat = bt.deputat if bt.deputat is not None else t.deputat
            if bt.work_mo is not None: t.work_mo = bt.work_mo
            if bt.work_di is not None: t.work_di = bt.work_di
            if bt.work_mi is not None: t.work_mi = bt.work_mi
            if bt.work_do is not None: t.work_do = bt.work_do
            if bt.work_fr is not None: t.work_fr = bt.work_fr
            session.add(t); session.commit(); session.refresh(t)
        return t

    def upsert_room(br: BackupRoom) -> Room:
        r = session.exec(select(Room).where(Room.name == br.name)).first()
        if not r:
            r = Room(
                name=br.name,
                type=br.type,
                capacity=br.capacity,
                is_classroom=bool(br.is_classroom) if br.is_classroom is not None else False,
            )
            session.add(r); session.commit(); session.refresh(r)
        else:
            if br.type is not None:
                r.type = br.type
            if br.capacity is not None:
                r.capacity = br.capacity
            if br.is_classroom is not None:
                r.is_classroom = br.is_classroom
            session.add(r); session.commit(); session.refresh(r)
        return r

    def upsert_class(bc: BackupClass) -> Class:
        c = session.exec(select(Class).where(Class.name == bc.name)).first()
        if not c:
            c = Class(name=bc.name)
            session.add(c); session.commit(); session.refresh(c)
        # homeroom teacher by kuerzel or name
        if bc.homeroom_teacher:
            t = session.exec(select(Teacher).where(Teacher.kuerzel == bc.homeroom_teacher)).first()
            if not t:
                t = session.exec(select(Teacher).where(Teacher.name == bc.homeroom_teacher)).first()
            c.homeroom_teacher_id = t.id if t else None
        session.add(c); session.commit(); session.refresh(c)
        return c

    def upsert_subject(bs: BackupSubject) -> Subject:
        s = session.exec(select(Subject).where(Subject.name == bs.name)).first()
        if not s:
            s = Subject(
                name=bs.name,
                kuerzel=bs.kuerzel,
                color=bs.color,
                default_doppelstunde=(DoppelstundeEnum(bs.default_doppelstunde) if bs.default_doppelstunde else None),
                default_nachmittag=(NachmittagEnum(bs.default_nachmittag) if bs.default_nachmittag else None),
            )
            session.add(s); session.commit(); session.refresh(s)
        else:
            if bs.kuerzel is not None:
                s.kuerzel = bs.kuerzel
            if bs.color is not None:
                s.color = bs.color
            if bs.default_doppelstunde is not None:
                s.default_doppelstunde = DoppelstundeEnum(bs.default_doppelstunde)
            if bs.default_nachmittag is not None:
                s.default_nachmittag = NachmittagEnum(bs.default_nachmittag)
        if bs.required_room is not None:
            room = session.exec(select(Room).where(Room.name == bs.required_room)).first()
            s.required_room_id = room.id if room else None
        session.add(s); session.commit(); session.refresh(s)
        return s

    # Upsert master data
    t_map: Dict[str, Teacher] = {}
    for bt in payload.teachers or []:
        t = upsert_teacher(bt)
        key = (bt.kuerzel or bt.name or str(t.id)).strip()
        t_map[key] = t

    for br in payload.rooms or []:
        upsert_room(br)

    c_map: Dict[str, Class] = {}
    for bc in payload.classes or []:
        c = upsert_class(bc)
        c_map[bc.name] = c

    s_map: Dict[str, Subject] = {}
    for bs in payload.subjects or []:
        s = upsert_subject(bs)
        s_map[bs.name] = s

    # Curriculum (upsert by class+subject)
    for item in payload.curriculum or []:
        cls = c_map.get(item.class_name) or session.exec(select(Class).where(Class.name == item.class_name)).first()
        sub = s_map.get(item.subject_name) or session.exec(select(Subject).where(Subject.name == item.subject_name)).first()
        if not cls or not sub:
            raise HTTPException(status_code=400, detail=f"Unbekannte Klasse/Fach in curriculum: {item.class_name}/{item.subject_name}")
        existing = session.exec(select(ClassSubject).where(ClassSubject.class_id == cls.id, ClassSubject.subject_id == sub.id)).first()
        if existing:
            existing.wochenstunden = item.wochenstunden
            session.add(existing)
        else:
            session.add(ClassSubject(class_id=cls.id, subject_id=sub.id, wochenstunden=item.wochenstunden))
        session.commit()

    # Requirements (upsert by class+subject pair)
    for item in payload.requirements or []:
        cls = c_map.get(item.class_name) or session.exec(select(Class).where(Class.name == item.class_name)).first()
        sub = s_map.get(item.subject_name) or session.exec(select(Subject).where(Subject.name == item.subject_name)).first()
        # teacher by kuerzel first, then name
        t = None
        if item.teacher_name:
            t = session.exec(select(Teacher).where(Teacher.kuerzel == item.teacher_name)).first()
            if not t:
                t = session.exec(select(Teacher).where(Teacher.name == item.teacher_name)).first()
        if not (cls and sub and t):
            raise HTTPException(status_code=400, detail=f"Unbekannte Zuordnung in requirements: {item.class_name}/{item.subject_name}/{item.teacher_name}")
        existing = session.exec(select(Requirement).where(Requirement.class_id == cls.id, Requirement.subject_id == sub.id)).first()
        ds = item.doppelstunde or DoppelstundeEnum.kann.value
        nm = item.nachmittag or NachmittagEnum.kann.value
        if existing:
            existing.teacher_id = t.id
            existing.wochenstunden = item.wochenstunden
            existing.doppelstunde = DoppelstundeEnum(ds)
            existing.nachmittag = NachmittagEnum(nm)
            session.add(existing)
        else:
            session.add(
                Requirement(
                    class_id=cls.id,
                    subject_id=sub.id,
                    teacher_id=t.id,
                    wochenstunden=item.wochenstunden,
                    doppelstunde=DoppelstundeEnum(ds),
                    nachmittag=NachmittagEnum(nm),
                )
            )
        session.commit()

    # Rule profiles
    for rp in (payload.rule_profiles or []):
        # upsert by name
        existing = session.exec(select(RuleProfile).where(RuleProfile.name == rp.get("name"))).first()
        if existing:
            for k, v in rp.items():
                if k == "id":
                    continue
                setattr(existing, k, v)
            session.add(existing); session.commit()
        else:
            session.add(RuleProfile(**{k: v for k, v in rp.items() if k != "id"}))
            session.commit()

    return {"ok": True}
