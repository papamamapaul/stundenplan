from __future__ import annotations

from datetime import timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..config import settings
from ..core.security import create_access_token, require_active_user, verify_password
from ..database import get_session
from ..models import AccountUser, User, Account
from ..schemas import LoginRequest, TokenResponse, UserProfile, UserAccountLink

router = APIRouter(prefix='/auth', tags=['auth'])


@router.post('/login', response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    email = payload.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Ungültige Zugangsdaten')
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Benutzer ist deaktiviert')

    access_token = create_access_token({
        'sub': str(user.id),
        'is_superuser': user.is_superuser,
        'email': user.email,
    }, expires_delta=timedelta(minutes=settings.access_token_expire_minutes))
    return TokenResponse(access_token=access_token, token_type='bearer', expires_in=settings.access_token_expire_minutes * 60)


@router.get('/me', response_model=UserProfile)
def get_profile(current_user: User = Depends(require_active_user), session: Session = Depends(get_session)) -> UserProfile:
    account_links = session.exec(
        select(AccountUser, Account)
        .join(Account, Account.id == AccountUser.account_id)
        .where(AccountUser.user_id == current_user.id)
    ).all()
    accounts: List[UserAccountLink] = []
    for link, account in account_links:
        accounts.append(UserAccountLink(account_id=account.id, account_name=account.name, role=link.role.value))
    return UserProfile(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_superuser=current_user.is_superuser,
        accounts=accounts,
    )
