from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete
from sqlmodel import Session, select

from ..core.security import require_active_user
from ..database import get_session
from ..models import (
    Class,
    ClassSubject,
    Requirement,
    RequirementParticipationEnum,
    RuleProfile,
    Subject,
    Teacher,
    Room,
    DoppelstundeEnum,
    NachmittagEnum,
    DistributionVersion,
    RequirementConfigSourceEnum,
    BasisPlan,
    Plan,
    PlanSlot,
)
from ..schemas import (
    BackupPayload,
    BackupTeacher,
    BackupClass,
    BackupSubject,
    BackupRoom,
    BackupCurriculumItem,
    BackupRequirementItem,
    SetupExport,
    DistributionExport,
    DistributionVersionExport,
    BasisPlanExport,
    PlansExport,
    PlanExportItem,
    PlanExportMetadata,
    PlanSlotExport,
    BasisPlanData,
)
from ..domain.accounts.service import resolve_account
from ..utils import ensure_teacher_color_column, next_teacher_color, normalize_hex_color


router = APIRouter(prefix="/backup", tags=["backup"], dependencies=[Depends(require_active_user)])


@router.get("/export", response_model=BackupPayload)
def export_data(
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> BackupPayload:
    ensure_teacher_color_column(session)
    account = resolve_account(session, account_id)
    teachers = session.exec(select(Teacher).where(Teacher.account_id == account.id)).all()
    classes = session.exec(select(Class).where(Class.account_id == account.id)).all()
    subjects = session.exec(select(Subject).where(Subject.account_id == account.id)).all()
    rooms = session.exec(select(Room).where(Room.account_id == account.id)).all()
    curriculum = session.exec(select(ClassSubject).where(ClassSubject.account_id == account.id)).all()
    requirements = session.exec(select(Requirement).where(Requirement.account_id == account.id)).all()
    rule_profiles = session.exec(select(RuleProfile).where(RuleProfile.account_id == account.id)).all()

    # Lookups
    teacher_by_id = {t.id: t for t in teachers}
    class_by_id = {c.id: c for c in classes}
    subject_by_id = {s.id: s for s in subjects}
    room_by_id = {r.id: r for r in rooms}

    out_teachers: List[BackupTeacher] = [
        BackupTeacher(
            name=t.name,
            kuerzel=t.kuerzel,
            color=t.color,
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
            is_bandfach=s.is_bandfach,
            is_ag_foerder=s.is_ag_foerder,
            alias_subject=subject_by_id[s.alias_subject_id].name if (s.alias_subject_id and subject_by_id.get(s.alias_subject_id)) else None,
        )
        for s in subjects
    ]

    out_curriculum: List[BackupCurriculumItem] = [
        BackupCurriculumItem(
            class_name=class_by_id[cs.class_id].name if class_by_id.get(cs.class_id) else str(cs.class_id),
            subject_name=subject_by_id[cs.subject_id].name if subject_by_id.get(cs.subject_id) else str(cs.subject_id),
            wochenstunden=cs.wochenstunden,
            participation=cs.participation.value if getattr(cs, "participation", None) else None,
            doppelstunde=cs.doppelstunde.value if getattr(cs, "doppelstunde", None) else None,
            nachmittag=cs.nachmittag.value if getattr(cs, "nachmittag", None) else None,
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
            participation=r.participation.value if r.participation else None,
            config_source=(
                r.config_source.value
                if isinstance(r.config_source, RequirementConfigSourceEnum)
                else (r.config_source if isinstance(r.config_source, str) else None)
            ),
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


@router.get("/export/setup", response_model=SetupExport)
def export_setup(
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> SetupExport:
    payload = export_data(account_id=account_id, session=session)
    return SetupExport(
        teachers=payload.teachers or [],
        classes=payload.classes or [],
        subjects=payload.subjects or [],
        rooms=payload.rooms or [],
        curriculum=payload.curriculum or [],
        rule_profiles=payload.rule_profiles or [],
    )


@router.post("/import/setup")
def import_setup(
    payload: SetupExport,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
    replace: bool = Query(False, description="Bestehende Daten ersetzen (truncate before import)"),
):
    converted = BackupPayload(
        teachers=payload.teachers,
        classes=payload.classes,
        subjects=payload.subjects,
        rooms=payload.rooms,
        curriculum=payload.curriculum,
        rule_profiles=payload.rule_profiles,
    )
    return import_data(payload=converted, account_id=account_id, session=session, replace=replace)


@router.post("/import")
def import_data(
    payload: BackupPayload,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
    replace: bool = Query(False, description="Bestehende Daten ersetzen (truncate before import)"),
):
    ensure_teacher_color_column(session)
    account = resolve_account(session, account_id)
    # Optionally clear tables (in dependency order)
    if replace:
        session.exec(delete(Requirement).where(Requirement.account_id == account.id))
        session.exec(delete(ClassSubject).where(ClassSubject.account_id == account.id))
        session.exec(delete(Subject).where(Subject.account_id == account.id))
        session.exec(delete(Room).where(Room.account_id == account.id))
        session.exec(delete(Class).where(Class.account_id == account.id))
        session.exec(delete(Teacher).where(Teacher.account_id == account.id))
        session.exec(delete(RuleProfile).where(RuleProfile.account_id == account.id))
        session.commit()

    # Helper: get-or-create by unique keys
    def upsert_teacher(bt: BackupTeacher) -> Teacher:
        t = None
        if bt.kuerzel:
            t = session.exec(
                select(Teacher).where(Teacher.account_id == account.id, Teacher.kuerzel == bt.kuerzel)
            ).first()
        if not t and bt.name:
            t = session.exec(
                select(Teacher).where(Teacher.account_id == account.id, Teacher.name == bt.name)
            ).first()
        if not t:
            color = normalize_hex_color(bt.color) or next_teacher_color(session, account.id)
            t = Teacher(
                account_id=account.id,
                name=bt.name or (bt.kuerzel or "").strip() or None,
                kuerzel=bt.kuerzel,
                color=color,
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
            normalized_color = normalize_hex_color(bt.color)
            if normalized_color:
                t.color = normalized_color
            elif t.color is None:
                t.color = next_teacher_color(session, account.id)
            if bt.work_mo is not None: t.work_mo = bt.work_mo
            if bt.work_di is not None: t.work_di = bt.work_di
            if bt.work_mi is not None: t.work_mi = bt.work_mi
            if bt.work_do is not None: t.work_do = bt.work_do
            if bt.work_fr is not None: t.work_fr = bt.work_fr
            session.add(t); session.commit(); session.refresh(t)
        return t

    def upsert_room(br: BackupRoom) -> Room:
        r = session.exec(
            select(Room).where(Room.account_id == account.id, Room.name == br.name)
        ).first()
        if not r:
            r = Room(
                account_id=account.id,
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
        c = session.exec(select(Class).where(Class.account_id == account.id, Class.name == bc.name)).first()
        if not c:
            c = Class(name=bc.name, account_id=account.id)
            session.add(c); session.commit(); session.refresh(c)
        # homeroom teacher by kuerzel or name
        if bc.homeroom_teacher:
            t = session.exec(
                select(Teacher).where(
                    Teacher.account_id == account.id,
                    Teacher.kuerzel == bc.homeroom_teacher,
                )
            ).first()
            if not t:
                t = session.exec(
                    select(Teacher).where(
                        Teacher.account_id == account.id,
                        Teacher.name == bc.homeroom_teacher,
                    )
                ).first()
            c.homeroom_teacher_id = t.id if t else None
        session.add(c); session.commit(); session.refresh(c)
        return c

    def upsert_subject(bs: BackupSubject) -> Subject:
        s = session.exec(select(Subject).where(Subject.account_id == account.id, Subject.name == bs.name)).first()
        if not s:
            s = Subject(
                account_id=account.id,
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
            room = session.exec(
                select(Room).where(Room.account_id == account.id, Room.name == bs.required_room)
            ).first()
            s.required_room_id = room.id if room else None
        if bs.is_bandfach is not None:
            s.is_bandfach = bool(bs.is_bandfach)
        if bs.is_ag_foerder is not None:
            s.is_ag_foerder = bool(bs.is_ag_foerder)
        if bs.alias_subject:
            alias = session.exec(
                select(Subject).where(Subject.account_id == account.id, Subject.name == bs.alias_subject)
            ).first()
            s.alias_subject_id = alias.id if alias else None
        else:
            s.alias_subject_id = None
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
        cls = c_map.get(item.class_name) or session.exec(
            select(Class).where(Class.account_id == account.id, Class.name == item.class_name)
        ).first()
        sub = s_map.get(item.subject_name) or session.exec(
            select(Subject).where(Subject.account_id == account.id, Subject.name == item.subject_name)
        ).first()
        if not cls or not sub:
            raise HTTPException(status_code=400, detail=f"Unbekannte Klasse/Fach in curriculum: {item.class_name}/{item.subject_name}")
        participation = RequirementParticipationEnum(item.participation) if item.participation else RequirementParticipationEnum.curriculum
        doppel = DoppelstundeEnum(item.doppelstunde) if item.doppelstunde else None
        nachmittag = NachmittagEnum(item.nachmittag) if item.nachmittag else None
        existing = session.exec(
            select(ClassSubject).where(
                ClassSubject.account_id == account.id,
                ClassSubject.class_id == cls.id,
                ClassSubject.subject_id == sub.id,
            )
        ).first()
        if existing:
            existing.wochenstunden = item.wochenstunden
            existing.participation = participation
            existing.doppelstunde = doppel
            existing.nachmittag = nachmittag
            session.add(existing)
        else:
            session.add(
                ClassSubject(
                    account_id=account.id,
                    class_id=cls.id,
                    subject_id=sub.id,
                    wochenstunden=item.wochenstunden,
                    participation=participation,
                    doppelstunde=doppel,
                    nachmittag=nachmittag,
                )
            )
        session.commit()

    # Requirements (upsert by class+subject pair)
    for item in payload.requirements or []:
        cls = c_map.get(item.class_name) or session.exec(
            select(Class).where(Class.account_id == account.id, Class.name == item.class_name)
        ).first()
        sub = s_map.get(item.subject_name) or session.exec(
            select(Subject).where(Subject.account_id == account.id, Subject.name == item.subject_name)
        ).first()
        # teacher by kuerzel first, then name
        t = None
        if item.teacher_name:
            t = session.exec(
                select(Teacher).where(Teacher.account_id == account.id, Teacher.kuerzel == item.teacher_name)
            ).first()
            if not t:
                t = session.exec(
                    select(Teacher).where(Teacher.account_id == account.id, Teacher.name == item.teacher_name)
                ).first()
        if not (cls and sub and t):
            raise HTTPException(status_code=400, detail=f"Unbekannte Zuordnung in requirements: {item.class_name}/{item.subject_name}/{item.teacher_name}")
        existing = session.exec(
            select(Requirement).where(
                Requirement.account_id == account.id,
                Requirement.class_id == cls.id,
                Requirement.subject_id == sub.id,
            )
        ).first()
        ds = item.doppelstunde or DoppelstundeEnum.kann.value
        nm = item.nachmittag or NachmittagEnum.kann.value
        participation = RequirementParticipationEnum(item.participation) if item.participation else RequirementParticipationEnum.curriculum
        config_source = RequirementConfigSourceEnum(item.config_source) if item.config_source else RequirementConfigSourceEnum.subject
        if existing:
            existing.teacher_id = t.id
            existing.wochenstunden = item.wochenstunden
            existing.doppelstunde = DoppelstundeEnum(ds)
            existing.nachmittag = NachmittagEnum(nm)
            existing.participation = participation
            existing.config_source = config_source
            session.add(existing)
        else:
            session.add(
                Requirement(
                    account_id=account.id,
                    class_id=cls.id,
                    subject_id=sub.id,
                    teacher_id=t.id,
                    wochenstunden=item.wochenstunden,
                    doppelstunde=DoppelstundeEnum(ds),
                    nachmittag=NachmittagEnum(nm),
                    participation=participation,
                    config_source=config_source,
                )
            )
        session.commit()

    # Rule profiles
    for rp in (payload.rule_profiles or []):
        # upsert by name
        existing = session.exec(
            select(RuleProfile).where(
                RuleProfile.account_id == account.id,
                RuleProfile.name == rp.get("name"),
            )
        ).first()
        if existing:
            for k, v in rp.items():
                if k == "id":
                    continue
                setattr(existing, k, v)
            session.add(existing); session.commit()
        else:
            data = {k: v for k, v in rp.items() if k != "id"}
            data["account_id"] = account.id
            session.add(RuleProfile(**data))
            session.commit()

    return {"ok": True}


def _lookup_maps(session: Session, account_id: int) -> Dict[str, Dict[int, object]]:
    teachers = session.exec(select(Teacher).where(Teacher.account_id == account_id)).all()
    classes = session.exec(select(Class).where(Class.account_id == account_id)).all()
    subjects = session.exec(select(Subject).where(Subject.account_id == account_id)).all()
    rooms = session.exec(select(Room).where(Room.account_id == account_id)).all()
    return {
        "teachers": {t.id: t for t in teachers},
        "classes": {c.id: c for c in classes},
        "subjects": {s.id: s for s in subjects},
        "rooms": {r.id: r for r in rooms},
    }


@router.get("/export/distribution", response_model=DistributionExport)
def export_distribution(
    version_id: int = Query(..., description="ID der zu exportierenden Stundenverteilungs-Version"),
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> DistributionExport:
    account = resolve_account(session, account_id)
    version = session.get(DistributionVersion, version_id)
    if not version or version.account_id != account.id:
        raise HTTPException(status_code=404, detail="Version nicht gefunden")

    data_maps = _lookup_maps(session, account.id)
    teacher_by_id = data_maps["teachers"]
    class_by_id = data_maps["classes"]
    subject_by_id = data_maps["subjects"]
    room_by_id = data_maps["rooms"]

    requirements = session.exec(
        select(Requirement).where(
            Requirement.account_id == account.id,
            Requirement.version_id == version_id,
        )
    ).all()
    items: List[BackupRequirementItem] = []
    for req in requirements:
        teacher = teacher_by_id.get(req.teacher_id)
        cls = class_by_id.get(req.class_id)
        subject = subject_by_id.get(req.subject_id)
        if not (teacher and cls and subject):
            raise HTTPException(
                status_code=400,
                detail=f"Ungültiger Requirement-Eintrag (ID {req.id}) – Stammdaten nicht gefunden.",
            )
        teacher_name = teacher.kuerzel or teacher.name or str(teacher.id)
        items.append(
            BackupRequirementItem(
                class_name=cls.name,
                subject_name=subject.name,
                teacher_name=teacher_name,
                wochenstunden=req.wochenstunden,
                doppelstunde=req.doppelstunde.value,
                nachmittag=req.nachmittag.value,
                participation=req.participation.value if req.participation else None,
                version_name=version.name,
                config_source=(
                    req.config_source.value
                    if isinstance(req.config_source, RequirementConfigSourceEnum)
                    else (req.config_source if isinstance(req.config_source, str) else None)
                ),
            )
        )

    version_export = DistributionVersionExport(
        name=version.name,
        comment=version.comment,
        created_at=version.created_at,
        updated_at=version.updated_at,
    )
    return DistributionExport(version=version_export, requirements=items)


@router.post("/import/distribution")
def import_distribution(
    payload: DistributionExport,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
    replace: bool = Query(False, description="Vorhandene Requirements der Version überschreiben, falls sie existiert"),
) -> Dict[str, int]:
    account = resolve_account(session, account_id)
    if not payload.version:
        raise HTTPException(status_code=400, detail="Versionsinformationen fehlen.")

    version = session.exec(
        select(DistributionVersion).where(
            DistributionVersion.account_id == account.id,
            DistributionVersion.name == payload.version.name,
        )
    ).first()
    if version:
        if replace:
            session.exec(
                delete(Requirement).where(
                    Requirement.account_id == account.id,
                    Requirement.version_id == version.id,
                )
            )
            session.commit()
        else:
            raise HTTPException(status_code=409, detail="Version existiert bereits. Mit replace=true überschreiben.")
        version.comment = payload.version.comment
        version.updated_at = payload.version.updated_at or datetime.now(timezone.utc)
        session.add(version)
        session.commit()
        session.refresh(version)
    else:
        version = DistributionVersion(
            account_id=account.id,
            name=payload.version.name,
            comment=payload.version.comment,
            created_at=payload.version.created_at or datetime.now(timezone.utc),
            updated_at=payload.version.updated_at or datetime.now(timezone.utc),
        )
        session.add(version)
        session.commit()
        session.refresh(version)

    teachers = session.exec(select(Teacher).where(Teacher.account_id == account.id)).all()
    teachers_map = {t.name: t for t in teachers}
    for t in teachers:
        if t.kuerzel:
            teachers_map[t.kuerzel] = t
    classes_map = {c.name: c for c in session.exec(select(Class).where(Class.account_id == account.id)).all()}
    subjects_map = {s.name: s for s in session.exec(select(Subject).where(Subject.account_id == account.id)).all()}

    new_requirements: List[Requirement] = []
    for item in payload.requirements or []:
        cls = classes_map.get(item.class_name)
        subject = subjects_map.get(item.subject_name)
        teacher = teachers_map.get(item.teacher_name) if item.teacher_name else None
        if not cls or not subject or not teacher:
            raise HTTPException(
                status_code=400,
                detail=f"Klasse/Fach/Lehrkraft nicht gefunden: {item.class_name}/{item.subject_name}/{item.teacher_name}",
            )
        ds = DoppelstundeEnum(item.doppelstunde) if item.doppelstunde else DoppelstundeEnum.kann
        nm = NachmittagEnum(item.nachmittag) if item.nachmittag else NachmittagEnum.kann
        participation = RequirementParticipationEnum(item.participation) if item.participation else RequirementParticipationEnum.curriculum
        config_source = RequirementConfigSourceEnum(item.config_source) if item.config_source else RequirementConfigSourceEnum.subject
        new_requirements.append(
            Requirement(
                account_id=account.id,
                class_id=cls.id,
                subject_id=subject.id,
                teacher_id=teacher.id,
                version_id=version.id,
                wochenstunden=item.wochenstunden,
                doppelstunde=ds,
                nachmittag=nm,
                participation=participation,
                config_source=config_source,
            )
        )

    if new_requirements:
        session.bulk_save_objects(new_requirements)
        session.commit()

    return {"version_id": version.id}


def _load_basisplan_data(row: BasisPlan) -> BasisPlanData:
    raw: Dict[str, object] = {}
    if row.data:
        try:
            raw = json.loads(row.data)
        except json.JSONDecodeError:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    raw.setdefault("meta", {"version": 1})
    raw.setdefault("classes", {})
    raw.setdefault("rooms", {})
    raw.setdefault("windows", {})
    raw.setdefault("fixed", {})
    raw.setdefault("flexible", {})
    return BasisPlanData(**raw)


@router.get("/export/basisplan", response_model=BasisPlanExport)
def export_basisplan_snapshot(
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> BasisPlanExport:
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    row = session.exec(
        select(BasisPlan).where(
            BasisPlan.account_id == account.id,
            BasisPlan.planning_period_id == period.id,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Kein Basisplan gespeichert.")
    data = _load_basisplan_data(row)
    return BasisPlanExport(name=row.name, updated_at=row.updated_at, data=data)


@router.post("/import/basisplan")
def import_basisplan_snapshot(
    payload: BasisPlanExport,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> Dict[str, int]:
    account = resolve_account(session, account_id)
    period = resolve_planning_period(session, account, planning_period_id)
    row = session.exec(
        select(BasisPlan).where(
            BasisPlan.account_id == account.id,
            BasisPlan.planning_period_id == period.id,
        )
    ).first()
    if not row:
        row = BasisPlan(name=payload.name or "Basisplan", account_id=account.id, planning_period_id=period.id)
    if payload.name:
        row.name = payload.name
    if payload.data is not None:
        row.data = json.dumps(payload.data.dict())
    row.updated_at = payload.updated_at or datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"basisplan_id": row.id}


@router.get("/export/plans", response_model=PlansExport)
def export_plans(
    plan_ids: List[int] = Query(..., description="Kommaseparierte Liste von Plan-IDs", alias="plan_ids"),
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> PlansExport:
    account = resolve_account(session, account_id)
    if not plan_ids:
        raise HTTPException(status_code=400, detail="Mindestens eine Plan-ID angeben.")
    plans = session.exec(
        select(Plan).where(Plan.account_id == account.id, Plan.id.in_(plan_ids))
    ).all()
    if not plans:
        raise HTTPException(status_code=404, detail="Keine passenden Pläne gefunden.")

    data_maps = _lookup_maps(session, account.id)
    teacher_by_id = data_maps["teachers"]
    class_by_id = data_maps["classes"]
    subject_by_id = data_maps["subjects"]

    rule_profiles = {rp.id: rp for rp in session.exec(select(RuleProfile)).all()}
    versions = {v.id: v for v in session.exec(select(DistributionVersion)).all()}

    items: List[PlanExportItem] = []
    for plan in plans:
        version = versions.get(plan.version_id) if plan.version_id else None
        rule_profile = rule_profiles.get(plan.rule_profile_id) if plan.rule_profile_id else None
        rule_keys = []
        if plan.rule_keys_active:
            try:
                rule_keys = json.loads(plan.rule_keys_active)
            except json.JSONDecodeError:
                rule_keys = []
        params_used = None
        if plan.params_used:
            try:
                params_used = json.loads(plan.params_used)
            except json.JSONDecodeError:
                params_used = None
        rules_snapshot = None
        if plan.rules_snapshot:
            try:
                rules_snapshot = json.loads(plan.rules_snapshot)
            except json.JSONDecodeError:
                rules_snapshot = None

        metadata = PlanExportMetadata(
            name=plan.name,
            status=plan.status,
            score=plan.score,
            objective_value=plan.objective_value,
            created_at=plan.created_at,
            comment=plan.comment,
            version_name=version.name if version else None,
            rule_profile_name=rule_profile.name if rule_profile else None,
            rule_keys_active=rule_keys,
            rules_snapshot=rules_snapshot,
            params_used=params_used,
        )

        slots = session.exec(select(PlanSlot).where(PlanSlot.plan_id == plan.id)).all()
        slot_items: List[PlanSlotExport] = []
        for slot in slots:
            cls = class_by_id.get(slot.class_id)
            subject = subject_by_id.get(slot.subject_id)
            teacher = teacher_by_id.get(slot.teacher_id)
            if not (cls and subject and teacher):
                raise HTTPException(status_code=400, detail=f"PlanSlot verweist auf fehlende Stammdaten (Plan {plan.id}).")
            room = room_by_id.get(slot.room_id) if slot.room_id else None
            slot_items.append(
                PlanSlotExport(
                    class_name=cls.name,
                    subject_name=subject.name,
                    teacher_name=teacher.kuerzel or teacher.name or str(teacher.id),
                    room_name=room.name if room else None,
                    tag=slot.tag,
                    stunde=slot.stunde,
                )
            )

        items.append(PlanExportItem(plan=metadata, slots=slot_items))

    return PlansExport(plans=items)


@router.post("/import/plans")
def import_plans(
    payload: PlansExport,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
    replace: bool = Query(False, description="Vorhandene Pläne mit gleichem Namen vor dem Import löschen"),
) -> Dict[str, int]:
    account = resolve_account(session, account_id)
    if not payload.plans:
        raise HTTPException(status_code=400, detail="Keine Pläne im Payload.")
    teachers = session.exec(select(Teacher).where(Teacher.account_id == account.id)).all()
    teacher_map = {t.name: t for t in teachers}
    for t in teachers:
        if t.kuerzel:
            teacher_map[t.kuerzel] = t
    class_map = {c.name: c for c in session.exec(select(Class).where(Class.account_id == account.id)).all()}
    subject_map = {s.name: s for s in session.exec(select(Subject).where(Subject.account_id == account.id)).all()}
    room_map = {r.name: r for r in session.exec(select(Room).where(Room.account_id == account.id)).all()}
    rule_profile_map = {rp.name: rp for rp in session.exec(select(RuleProfile).where(RuleProfile.account_id == account.id)).all()}
    version_map = {v.name: v for v in session.exec(select(DistributionVersion).where(DistributionVersion.account_id == account.id)).all()}

    created_plan_ids: List[int] = []
    for item in payload.plans:
        meta = item.plan
        if replace:
            existing_plans = session.exec(
                select(Plan).where(
                    Plan.account_id == account.id,
                    Plan.name == meta.name,
                )
            ).all()
            for existing_plan in existing_plans:
                session.exec(delete(PlanSlot).where(PlanSlot.plan_id == existing_plan.id))
                session.exec(delete(Plan).where(Plan.id == existing_plan.id))
            if existing_plans:
                session.commit()

        version_id = None
        if meta.version_name:
            version = version_map.get(meta.version_name)
            if not version:
                raise HTTPException(status_code=400, detail=f"Version '{meta.version_name}' nicht gefunden. Bitte zuerst exportierte Stundenverteilung importieren.")
            version_id = version.id

        rule_profile_id = None
        if meta.rule_profile_name:
            rp = rule_profile_map.get(meta.rule_profile_name)
            if not rp:
                raise HTTPException(status_code=400, detail=f"Regelprofil '{meta.rule_profile_name}' nicht gefunden.")
            rule_profile_id = rp.id

        plan = Plan(
            account_id=account.id,
            name=meta.name,
            status=meta.status,
            score=meta.score,
            objective_value=meta.objective_value,
            created_at=meta.created_at,
            comment=meta.comment,
            version_id=version_id,
            rule_profile_id=rule_profile_id,
        )
        plan.rule_keys_active = json.dumps(meta.rule_keys_active or [])
        plan.rules_snapshot = json.dumps(meta.rules_snapshot) if meta.rules_snapshot is not None else None
        plan.params_used = json.dumps(meta.params_used) if meta.params_used is not None else None

        session.add(plan)
        session.commit()
        session.refresh(plan)

        for slot_data in item.slots:
            cls = class_map.get(slot_data.class_name)
            subject = subject_map.get(slot_data.subject_name)
            teacher = teacher_map.get(slot_data.teacher_name)
            if not (cls and subject and teacher):
                raise HTTPException(
                    status_code=400,
                    detail=f"Stammdaten fehlen für Slot {slot_data.class_name}/{slot_data.subject_name}/{slot_data.teacher_name}",
                )
            room_id = None
            if slot_data.room_name:
                room = room_map.get(slot_data.room_name)
                if not room:
                    raise HTTPException(status_code=400, detail=f"Raum '{slot_data.room_name}' nicht gefunden. Bitte zuerst Räume importieren.")
                room_id = room.id
            slot = PlanSlot(
                account_id=account.id,
                plan_id=plan.id,
                class_id=cls.id,
                subject_id=subject.id,
                teacher_id=teacher.id,
                room_id=room_id,
                tag=slot_data.tag,
                stunde=slot_data.stunde,
            )
            session.add(slot)
        session.commit()
        created_plan_ids.append(plan.id)

    return {"count": len(created_plan_ids)}
