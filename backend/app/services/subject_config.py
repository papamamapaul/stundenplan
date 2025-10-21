from __future__ import annotations

from typing import Optional

from sqlmodel import Session, select

from ..models import (
    ClassSubject,
    DoppelstundeEnum,
    NachmittagEnum,
    Requirement,
    RequirementConfigSourceEnum,
    RequirementParticipationEnum,
    Subject,
)


def _ensure_enum(value, enum_cls, default):
    if value is None:
        return default
    if isinstance(value, enum_cls):
        return value
    try:
        return enum_cls(value)
    except ValueError:
        return default


def resolve_doppelstunde(session: Session, subject_id: int, class_subject: Optional[ClassSubject] = None) -> DoppelstundeEnum:
    subject = session.get(Subject, subject_id)
    default_value = subject.default_doppelstunde if subject else None
    fallback = default_value or DoppelstundeEnum.kann
    if class_subject and class_subject.doppelstunde:
        return _ensure_enum(class_subject.doppelstunde, DoppelstundeEnum, fallback)
    return _ensure_enum(default_value, DoppelstundeEnum, fallback)


def resolve_nachmittag(session: Session, subject_id: int, class_subject: Optional[ClassSubject] = None) -> NachmittagEnum:
    subject = session.get(Subject, subject_id)
    default_value = subject.default_nachmittag if subject else None
    fallback = default_value or NachmittagEnum.kann
    if class_subject and class_subject.nachmittag:
        return _ensure_enum(class_subject.nachmittag, NachmittagEnum, fallback)
    return _ensure_enum(default_value, NachmittagEnum, fallback)


def resolve_participation(class_subject: Optional[ClassSubject]) -> RequirementParticipationEnum:
    value = class_subject.participation if class_subject else None
    if isinstance(value, RequirementParticipationEnum):
        return value
    if value:
        try:
            return RequirementParticipationEnum(value)
        except ValueError:
            pass
    return RequirementParticipationEnum.curriculum


def sync_requirements_for_class_subject(session: Session, class_id: int, subject_id: int) -> int:
    """Apply the current class-subject configuration to all matching requirements.

    Returns the number of updated requirements.
    """
    class_subject = session.exec(
        select(ClassSubject).where(ClassSubject.class_id == class_id, ClassSubject.subject_id == subject_id)
    ).first()
    doppel = resolve_doppelstunde(session, subject_id, class_subject)
    nachmittag = resolve_nachmittag(session, subject_id, class_subject)
    participation = resolve_participation(class_subject)

    updated = 0
    requirement_stmt = select(Requirement).where(
        Requirement.class_id == class_id,
        Requirement.subject_id == subject_id,
    )
    for req in session.exec(requirement_stmt):
        if req.config_source == RequirementConfigSourceEnum.manual:
            continue
        req.doppelstunde = doppel
        req.nachmittag = nachmittag
        req.config_source = RequirementConfigSourceEnum.subject
        req.participation = participation
        session.add(req)
        updated += 1

    if updated:
        session.commit()
    return updated


def apply_subject_defaults(session: Session, requirement: Requirement) -> Requirement:
    """Apply subject/class defaults to a requirement and mark it as subject-config driven."""
    class_subject = session.exec(
        select(ClassSubject).where(
            ClassSubject.class_id == requirement.class_id,
            ClassSubject.subject_id == requirement.subject_id,
        )
    ).first()

    requirement.doppelstunde = resolve_doppelstunde(session, requirement.subject_id, class_subject)
    requirement.nachmittag = resolve_nachmittag(session, requirement.subject_id, class_subject)
    requirement.participation = resolve_participation(class_subject)
    requirement.config_source = RequirementConfigSourceEnum.subject
    return requirement


def sync_requirements_for_subject(session: Session, subject_id: int) -> int:
    """Re-apply subject defaults for all requirements of a subject."""
    updated = 0
    for req in session.exec(select(Requirement).where(Requirement.subject_id == subject_id)):
        if req.config_source == RequirementConfigSourceEnum.manual:
            continue
        apply_subject_defaults(session, req)
        session.add(req)
        updated += 1
    if updated:
        session.commit()
    return updated
