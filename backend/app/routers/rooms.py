from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import Room


router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=List[Room])
def list_rooms(session: Session = Depends(get_session)) -> List[Room]:
    return session.exec(select(Room)).all()


@router.post("", response_model=Room)
def create_room(payload: Room, session: Session = Depends(get_session)) -> Room:
    if not payload.name:
        raise HTTPException(status_code=400, detail="name required")
    exists = session.exec(select(Room).where(Room.name == payload.name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="room with same name exists")
    r = Room(
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
def update_room(room_id: int, payload: Room, session: Session = Depends(get_session)) -> Room:
    r = session.get(Room, room_id)
    if not r:
        raise HTTPException(status_code=404, detail="room not found")
    if payload.name:
        other = session.exec(select(Room).where(Room.name == payload.name, Room.id != room_id)).first()
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
def delete_room(room_id: int, session: Session = Depends(get_session)) -> dict:
    r = session.get(Room, room_id)
    if not r:
        raise HTTPException(status_code=404, detail="room not found")
    session.delete(r)
    session.commit()
    return {"ok": True}

