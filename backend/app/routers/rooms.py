from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..core.security import require_active_user
from ..database import get_session
from ..models import Room, Subject
from ..domain.accounts.service import resolve_account


router = APIRouter(prefix="/rooms", tags=["rooms"], dependencies=[Depends(require_active_user)])


@router.get("", response_model=List[Room])
def list_rooms(
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> List[Room]:
    account = resolve_account(session, account_id)
    return session.exec(select(Room).where(Room.account_id == account.id)).all()


@router.post("", response_model=Room)
def create_room(
    payload: Room,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> Room:
    account = resolve_account(session, account_id)
    if not payload.name:
        raise HTTPException(status_code=400, detail="name required")
    exists = session.exec(select(Room).where(Room.account_id == account.id, Room.name == payload.name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="room with same name exists")
    r = Room(
        account_id=account.id,
        name=payload.name,
        type=payload.type,
        capacity=payload.capacity,
        is_classroom=bool(payload.is_classroom),
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    return r


@router.put("/{room_id}", response_model=Room)
def update_room(
    room_id: int,
    payload: Room,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> Room:
    account = resolve_account(session, account_id)
    r = session.get(Room, room_id)
    if not r:
        raise HTTPException(status_code=404, detail="room not found")
    if r.account_id != account.id:
        raise HTTPException(status_code=403, detail="room belongs to different account")
    if payload.name:
        other = session.exec(
            select(Room).where(
                Room.account_id == account.id,
                Room.name == payload.name,
                Room.id != room_id,
            )
        ).first()
        if other:
            raise HTTPException(status_code=400, detail="room name already exists")
        r.name = payload.name
    if payload.type is not None:
        r.type = payload.type
    if payload.capacity is not None:
        r.capacity = payload.capacity
    if payload.is_classroom is not None:
        r.is_classroom = payload.is_classroom
    session.add(r)
    session.commit()
    session.refresh(r)
    return r


@router.delete("/{room_id}")
def delete_room(
    room_id: int,
    account_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
) -> dict:
    account = resolve_account(session, account_id)
    r = session.get(Room, room_id)
    if not r:
        raise HTTPException(status_code=404, detail="room not found")
    if r.account_id != account.id:
        raise HTTPException(status_code=403, detail="room belongs to different account")
    subject_usage = session.exec(
        select(Subject.id).where(
            Subject.account_id == account.id,
            Subject.required_room_id == room_id,
        ).limit(1)
    ).first()
    if subject_usage:
        raise HTTPException(
            status_code=400,
            detail="Raum kann nicht gelöscht werden. Bitte entferne zuerst Fächer, die diesen Raum als Pflicht-Raum verwenden.",
        )
    session.delete(r)
    session.commit()
    return {"ok": True}
