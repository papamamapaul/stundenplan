from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from ..core.security import hash_password, require_admin_user, require_active_user
from ..database import get_session
from ..models import Account, AccountRole, AccountUser, User
from ..schemas import (
    AccountCreateRequest,
    AccountOut,
    AccountUserCreate,
    AdminUserCreate,
    AdminUserOut,
)
from ..domain.accounts.service import (
    ensure_account_role,
    ensure_pool_teacher,
    resolve_account,
    ensure_default_planning_period,
)

router = APIRouter(prefix='/admin', tags=['admin'], dependencies=[Depends(require_admin_user)])
account_admin_router = APIRouter(prefix='/account-admin', tags=['account-admin'])


@router.get('/users', response_model=List[AdminUserOut])
def list_users(session: Session = Depends(get_session)) -> List[AdminUserOut]:
    users = session.exec(select(User).order_by(User.created_at)).all()
    results: List[AdminUserOut] = []
    for user in users:
        link = session.exec(select(AccountUser, Account).join(Account, Account.id == AccountUser.account_id).where(AccountUser.user_id == user.id).limit(1)).first()
        if link:
            link_entry, account_entry = link
            account_id = account_entry.id
            account_name = account_entry.name
            role = link_entry.role
        else:
            account_id = None
            account_name = None
            role = AccountRole.teacher
        results.append(
            AdminUserOut(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                is_superuser=user.is_superuser,
                created_at=user.created_at,
                account_id=account_id,
                account_name=account_name,
                role=role,
            )
        )
    return results


@router.post('/users', response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreate,
    session: Session = Depends(get_session),
) -> AdminUserOut:
    email = payload.email.strip().lower()
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Benutzer existiert bereits')
    account = resolve_account(session, payload.account_id)
    user = User(
        email=email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_active=True,
        is_superuser=payload.is_superuser,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    link = AccountUser(account_id=account.id, user_id=user.id, role=payload.role)
    session.add(link)
    session.commit()

    return AdminUserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_superuser=user.is_superuser,
        created_at=user.created_at,
        account_id=account.id,
        account_name=account.name,
        role=payload.role,
    )


@router.get('/accounts', response_model=List[AccountOut])
def list_accounts(session: Session = Depends(get_session)) -> List[AccountOut]:
    accounts = session.exec(select(Account).order_by(Account.created_at)).all()
    results: List[AccountOut] = []
    for acc in accounts:
        owner_link = session.exec(
            select(AccountUser, User)
            .join(User, User.id == AccountUser.user_id)
            .where(AccountUser.account_id == acc.id, AccountUser.role == AccountRole.owner)
            .limit(1)
        ).first()
        admin_email = owner_link[1].email if owner_link else None
        results.append(
            AccountOut(
                id=acc.id,
                name=acc.name,
                description=acc.description,
                created_at=acc.created_at,
                admin_email=admin_email,
            )
        )
    return results


@router.post('/accounts', response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreateRequest,
    session: Session = Depends(get_session),
) -> AccountOut:
    existing = session.exec(select(Account).where(Account.name == payload.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail='Schule mit diesem Namen existiert bereits')
    admin_email = payload.admin_email.strip().lower()
    user_exists = session.exec(select(User).where(User.email == admin_email)).first()
    if user_exists:
        raise HTTPException(status_code=400, detail='Admin-E-Mail wird bereits verwendet')
    account = Account(name=payload.name, description=payload.description)
    session.add(account)
    session.commit()
    session.refresh(account)
    ensure_pool_teacher(session, account)
    ensure_default_planning_period(session, account)

    admin_user = User(
        email=admin_email,
        full_name=payload.admin_full_name,
        password_hash=hash_password(payload.admin_password),
        is_active=True,
        is_superuser=False,
    )
    session.add(admin_user)
    session.commit()
    session.refresh(admin_user)

    link = AccountUser(account_id=account.id, user_id=admin_user.id, role=AccountRole.owner)
    session.add(link)
    session.commit()

    return AccountOut(
        id=account.id,
        name=account.name,
        description=account.description,
        created_at=account.created_at,
        admin_email=admin_user.email,
    )


def get_account_for_owner(
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_active_user),
) -> Account:
    account = resolve_account(session, account_id)
    ensure_account_role(session, current_user, account, (AccountRole.owner,))
    return account


@account_admin_router.get('/users', response_model=List[AdminUserOut])
def list_account_users(
    account: Account = Depends(get_account_for_owner),
    session: Session = Depends(get_session),
) -> List[AdminUserOut]:
    rows = session.exec(
        select(User, AccountUser)
        .join(AccountUser, AccountUser.user_id == User.id)
        .where(AccountUser.account_id == account.id)
        .order_by(User.created_at)
    ).all()
    results: List[AdminUserOut] = []
    for user, link in rows:
        results.append(
            AdminUserOut(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                is_superuser=user.is_superuser,
                created_at=user.created_at,
                account_id=account.id,
                account_name=account.name,
                role=link.role,
            )
        )
    return results


@account_admin_router.post('/users', response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def create_account_user(
    payload: AccountUserCreate,
    account: Account = Depends(get_account_for_owner),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_active_user),
) -> AdminUserOut:
    if not current_user.is_superuser and payload.role != AccountRole.teacher:
        raise HTTPException(status_code=403, detail='Schul-Admins können nur Lehrer anlegen')
    email = payload.email.strip().lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=400, detail='E-Mail wird bereits verwendet')
    user = User(
        email=email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    link = AccountUser(account_id=account.id, user_id=user.id, role=payload.role)
    session.add(link)
    session.commit()

    return AdminUserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_superuser=False,
        created_at=user.created_at,
        account_id=account.id,
        account_name=account.name,
        role=payload.role,
    )
