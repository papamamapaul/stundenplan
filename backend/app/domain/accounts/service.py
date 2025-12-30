from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import or_
from sqlmodel import Session, select

from ...config import settings
from ...core.security import get_current_user_context, hash_password
from ...models import Account, User, AccountUser, AccountRole, Teacher, PlanningPeriod
from ...utils import ensure_teacher_color_column


DEFAULT_ACCOUNT_NAME = "Default Account"
DEFAULT_PERIOD_NAME = "Standardperiode"
POOL_TEACHER_NAME = "Lehrkräfte-Pool"
POOL_TEACHER_KUERZEL = "POOL"
POOL_TEACHER_COLOR = "#475569"


def ensure_pool_teacher(session: Session, account: Account) -> Teacher:
    """Ensure a fallback teacher exists to absorb unassigned hours."""
    ensure_teacher_color_column(session)
    teacher = session.exec(
        select(Teacher).where(
            Teacher.account_id == account.id,
            or_(Teacher.kuerzel == POOL_TEACHER_KUERZEL, Teacher.name == POOL_TEACHER_NAME),
        )
    ).first()
    if teacher:
        changed = False
        if teacher.name != POOL_TEACHER_NAME:
            teacher.name = POOL_TEACHER_NAME
            changed = True
        if teacher.kuerzel != POOL_TEACHER_KUERZEL:
            teacher.kuerzel = POOL_TEACHER_KUERZEL
            changed = True
        if teacher.deputat is not None:
            teacher.deputat = None
            changed = True
        if teacher.deputat_soll is not None:
            teacher.deputat_soll = None
            changed = True
        if teacher.first_name or teacher.last_name:
            teacher.first_name = None
            teacher.last_name = None
            changed = True
        if not all([teacher.work_mo, teacher.work_di, teacher.work_mi, teacher.work_do, teacher.work_fr]):
            teacher.work_mo = teacher.work_di = teacher.work_mi = teacher.work_do = teacher.work_fr = True
            changed = True
        if teacher.color != POOL_TEACHER_COLOR:
            teacher.color = POOL_TEACHER_COLOR
            changed = True
        if changed:
            session.add(teacher)
            session.commit()
            session.refresh(teacher)
        return teacher

    teacher = Teacher(
        account_id=account.id,
        name=POOL_TEACHER_NAME,
        kuerzel=POOL_TEACHER_KUERZEL,
        color=POOL_TEACHER_COLOR,
        deputat=None,
        deputat_soll=None,
        work_mo=True,
        work_di=True,
        work_mi=True,
        work_do=True,
        work_fr=True,
    )
    session.add(teacher)
    session.commit()
    session.refresh(teacher)
    return teacher


def resolve_account(session: Session, account_id: int | None) -> Account:
    """Return requested account limited to the current user context if available."""
    current_user = get_current_user_context()
    allowed_account_ids: list[int] | None = None
    if current_user and not current_user.is_superuser:
        rows = session.exec(select(AccountUser.account_id).where(AccountUser.user_id == current_user.id)).all()
        allowed_account_ids = []
        for row in rows:
            if isinstance(row, (tuple, list)) and row:
                allowed_account_ids.append(int(row[0]))
            elif hasattr(row, 'account_id'):
                allowed_account_ids.append(int(row.account_id))
            elif isinstance(row, int):
                allowed_account_ids.append(int(row))
        if not allowed_account_ids:
            raise HTTPException(status_code=403, detail="Dem Benutzer ist kein Account zugewiesen")

    target_account_id = account_id
    if target_account_id is not None:
        if allowed_account_ids is not None and target_account_id not in allowed_account_ids:
            raise HTTPException(status_code=403, detail="Zugriff auf diesen Account ist nicht erlaubt")
        account = session.get(Account, target_account_id)
        if not account:
            raise HTTPException(status_code=404, detail="Account nicht gefunden")
    else:
        if allowed_account_ids:
            account = session.get(Account, allowed_account_ids[0])
        else:
            account = session.exec(select(Account).order_by(Account.created_at)).first()
            if not account:
                account = ensure_default_account(session)

    ensure_pool_teacher(session, account)
    ensure_default_planning_period(session, account)
    return account


def ensure_account_role(
    session: Session,
    user: User,
    account: Account,
    allowed_roles: tuple[AccountRole, ...] = (AccountRole.owner, AccountRole.planner),
) -> AccountRole:
    if user.is_superuser:
        return AccountRole.owner
    link = session.exec(
        select(AccountUser).where(
            AccountUser.account_id == account.id,
            AccountUser.user_id == user.id,
        )
    ).first()
    if not link or link.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Keine Berechtigung für diesen Account")
    return link.role


def ensure_default_account(session: Session) -> Account:
    account = session.exec(select(Account).where(Account.name == DEFAULT_ACCOUNT_NAME)).first()
    if account:
        ensure_pool_teacher(session, account)
        ensure_default_planning_period(session, account)
        return account
    account = Account(
        name=DEFAULT_ACCOUNT_NAME,
        description="Automatisch angelegter Standard-Account",
        created_at=datetime.now(timezone.utc),
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    ensure_pool_teacher(session, account)
    ensure_default_planning_period(session, account)
    return account


def ensure_default_admin(session: Session, account: Account) -> User:
    default_email = settings.default_admin_email or "admin@example.com"
    default_password = settings.default_admin_password or "admin"
    user = session.exec(select(User).where(User.email == default_email)).first()
    if not user:
        user = User(
            email=default_email,
            full_name="Admin",
            password_hash=hash_password(default_password),
            is_active=True,
            is_superuser=True,
            created_at=datetime.now(timezone.utc),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    elif not user.password_hash or not user.password_hash.startswith('$2'):
        user.password_hash = hash_password(default_password)
        session.add(user)
        session.commit()
        session.refresh(user)

    link = session.exec(
        select(AccountUser).where(
            AccountUser.account_id == account.id,
            AccountUser.user_id == user.id,
        )
    ).first()
    if not link:
        link = AccountUser(
            account_id=account.id,
            user_id=user.id,
            role=AccountRole.owner,
            created_at=datetime.now(timezone.utc),
        )
        session.add(link)
        session.commit()

    return user


def ensure_default_planning_period(session: Session, account: Account) -> PlanningPeriod:
    period = session.exec(
        select(PlanningPeriod)
        .where(PlanningPeriod.account_id == account.id)
        .order_by(PlanningPeriod.created_at)
    ).first()
    if period:
        active = session.exec(
            select(PlanningPeriod).where(
                PlanningPeriod.account_id == account.id,
                PlanningPeriod.is_active == True,  # noqa: E712
            ).limit(1)
        ).first()
        if not active:
            period.is_active = True
            session.add(period)
            session.commit()
            session.refresh(period)
        return period

    period = PlanningPeriod(
        account_id=account.id,
        name=DEFAULT_PERIOD_NAME,
        is_active=True,
    )
    session.add(period)
    session.commit()
    session.refresh(period)
    return period


def resolve_planning_period(session: Session, account: Account, planning_period_id: int | None) -> PlanningPeriod:
    if planning_period_id is not None:
        period = session.get(PlanningPeriod, planning_period_id)
        if not period or period.account_id != account.id:
            raise HTTPException(status_code=404, detail="Planungsperiode nicht gefunden")
        return period

    period = session.exec(
        select(PlanningPeriod)
        .where(
            PlanningPeriod.account_id == account.id,
            PlanningPeriod.is_active == True,  # noqa: E712
        )
        .order_by(PlanningPeriod.created_at.desc())
    ).first()
    if period:
        return period
    return ensure_default_planning_period(session, account)
