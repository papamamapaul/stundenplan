from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..core.security import require_active_user
from ..database import get_session
from ..models import (
    PlanningPeriod,
    Requirement,
    Plan,
    PlanSlot,
    DistributionVersion,
    BasisPlan,
    ClassSubject,
)
from ..schemas import PlanningPeriodCreate, PlanningPeriodUpdate, PlanningPeriodOut, PlanningPeriodCloneRequest
from ..domain.accounts.service import resolve_account


router = APIRouter(prefix="/planning-periods", tags=["planning-periods"], dependencies=[Depends(require_active_user)])


def _deactivate_other_periods(session: Session, account_id: int, active_period_id: int) -> None:
    others = session.exec(
        select(PlanningPeriod).where(
            PlanningPeriod.account_id == account_id,
            PlanningPeriod.id != active_period_id,
            PlanningPeriod.is_active == True,  # noqa: E712
        )
    ).all()
    for other in others:
        other.is_active = False
        other.updated_at = datetime.now(timezone.utc)
        session.add(other)
    if others:
        session.commit()


def _ensure_unique_name(session: Session, account_id: int, name: str, exclude_id: Optional[int] = None) -> None:
    stmt = select(PlanningPeriod).where(
        PlanningPeriod.account_id == account_id,
        PlanningPeriod.name == name,
    )
    if exclude_id is not None:
        stmt = stmt.where(PlanningPeriod.id != exclude_id)
    existing = session.exec(stmt).first()
    if existing:
        raise HTTPException(status_code=400, detail="Name der Planungsperiode bereits vergeben.")


def _next_available_version_name(
    session: Session,
    account_id: int,
    base_name: str,
    planning_period_id: int,
) -> str:
    candidate = base_name
    counter = 1
    while session.exec(
        select(DistributionVersion).where(
            DistributionVersion.account_id == account_id,
            DistributionVersion.name == candidate,
            DistributionVersion.planning_period_id == planning_period_id,
        )
    ).first():
        counter += 1
        candidate = f"{base_name} ({counter})"
    return candidate


@router.get("", response_model=List[PlanningPeriodOut])
def list_planning_periods(
    include_inactive: bool = Query(True, description="Inaktive Planungsperioden mit ausgeben"),
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> List[PlanningPeriodOut]:
    account = resolve_account(session, account_id)
    stmt = select(PlanningPeriod).where(PlanningPeriod.account_id == account.id)
    if not include_inactive:
        stmt = stmt.where(PlanningPeriod.is_active == True)  # noqa: E712
    stmt = stmt.order_by(PlanningPeriod.created_at.desc())
    rows = session.exec(stmt).all()
    return [PlanningPeriodOut.from_orm(row) for row in rows]


@router.post("", response_model=PlanningPeriodOut)
def create_planning_period(
    payload: PlanningPeriodCreate,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> PlanningPeriodOut:
    account = resolve_account(session, account_id)
    _ensure_unique_name(session, account.id, payload.name)

    period = PlanningPeriod(
        account_id=account.id,
        name=payload.name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_active=payload.is_active,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(period)
    session.commit()
    session.refresh(period)

    if payload.is_active:
        _deactivate_other_periods(session, account.id, period.id)

    return PlanningPeriodOut.from_orm(period)


@router.put("/{period_id}", response_model=PlanningPeriodOut)
def update_planning_period(
    period_id: int,
    payload: PlanningPeriodUpdate,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> PlanningPeriodOut:
    account = resolve_account(session, account_id)
    period = session.get(PlanningPeriod, period_id)
    if not period or period.account_id != account.id:
        raise HTTPException(status_code=404, detail="Planungsperiode nicht gefunden")

    data = payload.dict(exclude_unset=True)
    if "name" in data:
        new_name = data["name"]
        if not new_name:
            raise HTTPException(status_code=400, detail="Name darf nicht leer sein.")
        if new_name != period.name:
            _ensure_unique_name(session, account.id, new_name, exclude_id=period.id)
            period.name = new_name

    if "start_date" in data:
        period.start_date = data["start_date"]
    if "end_date" in data:
        period.end_date = data["end_date"]

    if "is_active" in data:
        period.is_active = bool(data["is_active"])

    period.updated_at = datetime.now(timezone.utc)
    session.add(period)
    session.commit()
    session.refresh(period)

    if period.is_active:
        _deactivate_other_periods(session, account.id, period.id)

    return PlanningPeriodOut.from_orm(period)


@router.delete("/{period_id}")
def delete_planning_period(
    period_id: int,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> dict:
    account = resolve_account(session, account_id)
    period = session.get(PlanningPeriod, period_id)
    if not period or period.account_id != account.id:
        raise HTTPException(status_code=404, detail="Planungsperiode nicht gefunden")

    dependencies: List[str] = []
    checks = [
        (Requirement, "Requirements"),
        (ClassSubject, "Curriculum"),
        (DistributionVersion, "Stundenverteilungs-Versionen"),
        (BasisPlan, "Basispläne"),
        (Plan, "Pläne"),
        (PlanSlot, "Plan-Slots"),
    ]
    for model, label in checks:
        exists = session.exec(
            select(model.id).where(
                model.account_id == account.id,
                getattr(model, "planning_period_id") == period.id,
            ).limit(1)
        ).first()
        if exists:
            dependencies.append(label)
    if dependencies:
        raise HTTPException(
            status_code=400,
            detail="Planungsperiode kann nicht gelöscht werden. Bitte entferne zuerst abhängige Daten: "
            + ", ".join(dependencies),
        )

    if period.is_active:
        replacement = session.exec(
            select(PlanningPeriod)
            .where(
                PlanningPeriod.account_id == account.id,
                PlanningPeriod.id != period.id,
            )
            .order_by(PlanningPeriod.created_at.desc())
            .first()
        )
        if replacement:
            replacement.is_active = True
            replacement.updated_at = datetime.now(timezone.utc)
            session.add(replacement)
        else:
            raise HTTPException(status_code=400, detail="Letzte aktive Planungsperiode kann nicht gelöscht werden.")

    session.delete(period)
    session.commit()
    return {"ok": True}


@router.post("/{period_id}/clone", response_model=PlanningPeriodOut)
def clone_planning_period(
    period_id: int,
    payload: PlanningPeriodCloneRequest,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> PlanningPeriodOut:
    account = resolve_account(session, account_id)
    source = session.get(PlanningPeriod, period_id)
    if not source or source.account_id != account.id:
        raise HTTPException(status_code=404, detail="Planungsperiode nicht gefunden")

    _ensure_unique_name(session, account.id, payload.name)

    new_period = PlanningPeriod(
        account_id=account.id,
        name=payload.name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_active=bool(payload.is_active),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(new_period)
    session.commit()
    session.refresh(new_period)

    if new_period.is_active:
        _deactivate_other_periods(session, account.id, new_period.id)

    if payload.copy_curriculum:
        curriculum_rows = session.exec(
            select(ClassSubject).where(
                ClassSubject.account_id == account.id,
                ClassSubject.planning_period_id == source.id,
            )
        ).all()
        for row in curriculum_rows:
            session.add(
                ClassSubject(
                    account_id=account.id,
                    planning_period_id=new_period.id,
                    class_id=row.class_id,
                    subject_id=row.subject_id,
                    wochenstunden=row.wochenstunden,
                    participation=row.participation,
                    doppelstunde=row.doppelstunde,
                    nachmittag=row.nachmittag,
                )
            )
        if curriculum_rows:
            session.commit()

    version_map: dict[int, int] = {}
    if payload.copy_versions:
        versions = session.exec(
            select(DistributionVersion).where(
                DistributionVersion.account_id == account.id,
                DistributionVersion.planning_period_id == source.id,
            )
        ).all()
        for version in versions:
            base_name = f"{version.name} ({new_period.name})"
            clone_name = _next_available_version_name(session, account.id, base_name, new_period.id)
            clone = DistributionVersion(
                account_id=account.id,
                planning_period_id=new_period.id,
                name=clone_name,
                comment=version.comment,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            session.add(clone)
            session.commit()
            session.refresh(clone)
            version_map[version.id] = clone.id

    if payload.copy_requirements:
        requirements = session.exec(
            select(Requirement).where(
                Requirement.account_id == account.id,
                Requirement.planning_period_id == source.id,
            )
        ).all()
        for req in requirements:
            clone_version_id = version_map.get(req.version_id) if version_map else None
            session.add(
                Requirement(
                    account_id=account.id,
                    class_id=req.class_id,
                    subject_id=req.subject_id,
                    teacher_id=req.teacher_id,
                    wochenstunden=req.wochenstunden,
                    doppelstunde=req.doppelstunde,
                    nachmittag=req.nachmittag,
                    participation=req.participation,
                    config_source=req.config_source,
                    version_id=clone_version_id,
                    planning_period_id=new_period.id,
                )
            )
        if requirements:
            session.commit()

    if payload.copy_basisplan:
        basis_plan = session.exec(
            select(BasisPlan).where(
                BasisPlan.account_id == account.id,
                BasisPlan.planning_period_id == source.id,
            )
        ).first()
        if basis_plan:
            session.add(
                BasisPlan(
                    account_id=account.id,
                    planning_period_id=new_period.id,
                    name=basis_plan.name,
                    data=basis_plan.data,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            session.commit()

    session.refresh(new_period)
    return PlanningPeriodOut.from_orm(new_period)
