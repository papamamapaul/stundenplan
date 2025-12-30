from __future__ import annotations

from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from ..config import settings
from ..database import get_session
from ..models import User

try:
    from passlib.context import CryptContext
except ImportError as exc:  # pragma: no cover
    raise RuntimeError('passlib is required for password hashing') from exc

# Passlib <-> bcrypt compatibility shim: newer bcrypt wheels don't expose __about__
if not hasattr(bcrypt, '__about__'):
    class _About:
        __slots__ = ('__version__',)

        def __init__(self, version: str):
            self.__version__ = version

    setattr(bcrypt, '__about__', _About(getattr(bcrypt, '__version__', 'unknown')))

pwd_context = CryptContext(schemes=['bcrypt_sha256'], deprecated='auto')
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/auth/login')
_current_user: ContextVar[Optional[User]] = ContextVar('current_user', default=None)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    if not hashed_password:
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload.update({'exp': expire, 'iat': now})
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token ungültig') from exc


def set_current_user(user: Optional[User]) -> None:
    _current_user.set(user)


def get_current_user_context() -> Optional[User]:
    return _current_user.get()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Authentifizierung erforderlich')
    payload = decode_token(token)
    user_id = payload.get('sub')
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Ungültiges Token')
    user = session.get(User, int(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Benutzer inaktiv oder nicht vorhanden')
    set_current_user(user)
    return user


def require_active_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


def require_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin-Rechte erforderlich')
    return current_user
