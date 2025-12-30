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
from ..utils import ensure_requirement_columns


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


def sync_requirements_for_class_subject(
    session: Session,
    account_id: int,
    class_id: int,
    subject_id: int,
    planning_period_id: Optional[int] = None,
) -> int:
    """Apply the current class-subject configuration to all matching requirements.

    Returns the number of updated requirements.
    """
    ensure_requirement_columns(session)
    stmt = select(ClassSubject).where(
        ClassSubject.account_id == account_id,
        ClassSubject.class_id == class_id,
        ClassSubject.subject_id == subject_id,
    )
    if planning_period_id is not None:
        stmt = stmt.where(
            (ClassSubject.planning_period_id == planning_period_id)
            | (ClassSubject.planning_period_id == None)  # noqa: E711
        )
    class_subject = session.exec(stmt).first()
    if class_subject and planning_period_id is not None and class_subject.planning_period_id is None:
        class_subject.planning_period_id = planning_period_id
        session.add(class_subject)
        session.commit()
        session.refresh(class_subject)
    doppel = resolve_doppelstunde(session, subject_id, class_subject)
    nachmittag = resolve_nachmittag(session, subject_id, class_subject)
    participation = resolve_participation(class_subject)

    updated = 0
    requirement_stmt = select(Requirement).where(
        Requirement.account_id == account_id,
        Requirement.class_id == class_id,
        Requirement.subject_id == subject_id,
    )
    if planning_period_id is not None:
        requirement_stmt = requirement_stmt.where(
            (Requirement.planning_period_id == planning_period_id)
            | (Requirement.planning_period_id == None)  # noqa: E711
        )
    for req in session.exec(requirement_stmt):
        if req.config_source == RequirementConfigSourceEnum.manual:
            continue
        if planning_period_id is not None and req.planning_period_id is None:
            req.planning_period_id = planning_period_id
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
    ensure_requirement_columns(session)
    stmt = select(ClassSubject).where(
        ClassSubject.account_id == requirement.account_id,
        ClassSubject.class_id == requirement.class_id,
        ClassSubject.subject_id == requirement.subject_id,
    )
    if requirement.planning_period_id is not None:
        stmt = stmt.where(
            (ClassSubject.planning_period_id == requirement.planning_period_id)
            | (ClassSubject.planning_period_id == None)  # noqa: E711
        )
    class_subject = session.exec(stmt).first()
    if class_subject and requirement.planning_period_id is not None and class_subject.planning_period_id is None:
        class_subject.planning_period_id = requirement.planning_period_id
        session.add(class_subject)

    requirement.doppelstunde = resolve_doppelstunde(session, requirement.subject_id, class_subject)
    requirement.nachmittag = resolve_nachmittag(session, requirement.subject_id, class_subject)
    requirement.participation = resolve_participation(class_subject)
    requirement.config_source = RequirementConfigSourceEnum.subject
    return requirement


def sync_requirements_for_subject(session: Session, subject_id: int) -> int:
    """Re-apply subject defaults for all requirements of a subject."""
    ensure_requirement_columns(session)
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
