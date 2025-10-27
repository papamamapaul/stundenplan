from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

from ..models import Account, User, AccountUser, AccountRole


DEFAULT_ACCOUNT_NAME = "Default Account"
DEFAULT_ADMIN_EMAIL = "admin@example.com"


def resolve_account(session: Session, account_id: int | None) -> Account:
    """Return requested account or default if None."""
    if account_id is not None:
        account = session.get(Account, account_id)
        if not account:
            raise HTTPException(status_code=404, detail="Account nicht gefunden")
        return account
    account = session.exec(select(Account).order_by(Account.created_at)).first()
    if not account:
        account = ensure_default_account(session)
    return account


def ensure_default_account(session: Session) -> Account:
    account = session.exec(select(Account).where(Account.name == DEFAULT_ACCOUNT_NAME)).first()
    if account:
        return account
    account = Account(
        name=DEFAULT_ACCOUNT_NAME,
        description="Automatisch angelegter Standard-Account",
        created_at=datetime.utcnow(),
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


def ensure_default_admin(session: Session, account: Account) -> User:
    user = session.exec(select(User).where(User.email == DEFAULT_ADMIN_EMAIL)).first()
    if not user:
        user = User(
            email=DEFAULT_ADMIN_EMAIL,
            full_name="Admin",
            password_hash="admin",  # Platzhalter; in Produktion ersetzen!
            is_active=True,
            is_superuser=True,
            created_at=datetime.utcnow(),
        )
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
            created_at=datetime.utcnow(),
        )
        session.add(link)
        session.commit()

    return user
