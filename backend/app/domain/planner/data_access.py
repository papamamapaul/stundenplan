from __future__ import annotations

from typing import Dict, List, Optional, Tuple, Set

import pandas as pd
from sqlalchemy import text
from sqlmodel import Session, select

from ...models import (
    Requirement,
    RequirementParticipationEnum,
    Subject,
    Teacher,
    Class,
    Room,
)

def _ensure_solver_schema(session: Session) -> None:
    info = session.exec(text("PRAGMA table_info(subject)"))
    columns = {row[1] for row in info}
    if "alias_subject_id" not in columns:
        session.exec(text("ALTER TABLE subject ADD COLUMN alias_subject_id INTEGER"))
        session.commit()

    info_req = session.exec(text("PRAGMA table_info(requirement)"))
    columns_req = {row[1] for row in info_req}
    if "participation" not in columns_req:
        session.exec(text("ALTER TABLE requirement ADD COLUMN participation TEXT DEFAULT 'curriculum'"))
        session.commit()


def fetch_requirements_dataframe(
    session: Session,
    account_id: int,
    planning_period_id: Optional[int] = None,
    version_id: Optional[int] = None,
) -> Tuple[pd.DataFrame, List[int], List[str], List[str], Dict[int, Dict[str, bool]], Set[str]]:
    _ensure_solver_schema(session)
    stmt = select(Requirement).where(Requirement.account_id == account_id)
    if planning_period_id is not None:
        stmt = stmt.where(
            (Requirement.planning_period_id == planning_period_id)
            | (Requirement.planning_period_id == None)  # noqa: E711
        )
    if version_id is not None:
        stmt = stmt.where(Requirement.version_id == version_id)
    reqs = session.exec(stmt).all()
    if not reqs:
        return pd.DataFrame(), [], [], [], {}, set()

    dirty = False
    if planning_period_id is not None:
        for req in reqs:
            if req.planning_period_id is None:
                req.planning_period_id = planning_period_id
                session.add(req)
                dirty = True
        if dirty:
            session.commit()

    subject_rows = session.exec(select(Subject).where(Subject.account_id == account_id)).all()
    room_rows = session.exec(select(Room).where(Room.account_id == account_id)).all()
    teacher_rows = session.exec(select(Teacher).where(Teacher.account_id == account_id)).all()
    subjects = {s.id: s.name for s in subject_rows}
    subject_room = {s.id: s.required_room_id for s in subject_rows}
    rooms = {r.id: r.name for r in room_rows}
    subject_band = {s.id: bool(s.is_bandfach) for s in subject_rows}
    subject_ag = {s.id: bool(s.is_ag_foerder) for s in subject_rows}
    subject_alias = {s.id: s.alias_subject_id for s in subject_rows}
    teachers = {t.id: t.name for t in teacher_rows}
    pool_teacher_ids = {
        t.id
        for t in teacher_rows
        if ((t.kuerzel or "").strip().lower() == "pool") or (t.name or "").strip().lower() == "lehrkräfte-pool"
    }
    pool_teacher_names = {teachers[tid] for tid in pool_teacher_ids if tid in teachers}
    teacher_workdays = {
        t.id: {
            "Mo": bool(t.work_mo),
            "Di": bool(t.work_di),
            "Mi": bool(t.work_mi),
            "Do": bool(t.work_do),
            "Fr": bool(t.work_fr),
        }
        for t in teacher_rows
    }
    classes = {c.id: c.name for c in session.exec(select(Class).where(Class.account_id == account_id)).all()}

    def _canonical_subject_id(subject_id: int) -> int:
        seen = set()
        current = subject_id
        while subject_alias.get(current):
            if current in seen:
                break
            seen.add(current)
            alias_id = subject_alias.get(current)
            if alias_id is None:
                break
            current = alias_id
        return current

    canonical_names = {
        sid: subjects.get(_canonical_subject_id(sid), subjects.get(sid, str(sid)))
        for sid in subjects.keys()
    }

    records = []
    for r in reqs:
        room_id = subject_room.get(r.subject_id)
        room_name = rooms.get(room_id) if room_id else None
        is_bandfach = subject_band.get(r.subject_id, False)
        participation = (
            r.participation.value
            if isinstance(r.participation, RequirementParticipationEnum)
            else RequirementParticipationEnum.curriculum.value
        )
        canonical_id = _canonical_subject_id(r.subject_id)
        record = {
            "Fach": subjects.get(r.subject_id, str(r.subject_id)),
            "Klasse": classes.get(r.class_id, str(r.class_id)),
            "Lehrer": teachers.get(r.teacher_id, str(r.teacher_id)),
            "Wochenstunden": int(r.wochenstunden),
            "Doppelstunde": r.doppelstunde.value,
            "Nachmittag": r.nachmittag.value,
            "RoomID": room_id,
            "Room": room_name,
            "Participation": participation,
            "CanonicalSubjectId": canonical_id,
            "CanonicalSubject": canonical_names.get(r.subject_id, subjects.get(r.subject_id, str(r.subject_id))),
            "TeacherId": r.teacher_id,
        }
        record["Bandfach"] = bool(is_bandfach)
        record["AGFoerder"] = bool(subject_ag.get(r.subject_id, False))
        records.append(record)

    df = pd.DataFrame.from_records(records)
    FACH_ID = list(df.index)
    KLASSEN = [
        str(x)
        for x in sorted(df["Klasse"].unique(), key=lambda v: int(str(v)) if str(v).isdigit() else str(v))
    ]
    LEHRER = sorted(df["Lehrer"].astype(str).unique())
    return df, FACH_ID, KLASSEN, LEHRER, teacher_workdays, pool_teacher_names
