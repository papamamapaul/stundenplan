from __future__ import annotations

from typing import List

from sqlalchemy import text
from sqlmodel import Session

from ...utils import ensure_requirement_columns as ensure_requirement_columns_db


def ensure_plan_period_columns(session: Session) -> None:
    info = session.exec(text("PRAGMA table_info(plan)"))
    columns = {row[1] for row in info}
    altered = False
    if "planning_period_id" not in columns:
        session.exec(text("ALTER TABLE plan ADD COLUMN planning_period_id INTEGER"))
        altered = True
    info_slots = session.exec(text("PRAGMA table_info(planslot)"))
    columns_slots = {row[1] for row in info_slots}
    if "planning_period_id" not in columns_slots:
        session.exec(text("ALTER TABLE planslot ADD COLUMN planning_period_id INTEGER"))
        altered = True
    if altered:
        session.commit()


def ensure_plan_room_column(session: Session) -> None:
    info_slots = session.exec(text("PRAGMA table_info(planslot)"))
    columns_slots = {row[1] for row in info_slots}
    if "room_id" not in columns_slots:
        session.exec(text("ALTER TABLE planslot ADD COLUMN room_id INTEGER"))
        session.commit()


def ensure_plan_metadata_columns(session: Session) -> None:
    info = session.exec(text("PRAGMA table_info(plan)")).all()
    columns = {row[1] for row in info}
    statements: List[str] = []
    if "rules_snapshot" not in columns:
        statements.append("ALTER TABLE plan ADD COLUMN rules_snapshot TEXT")
    if "rule_keys_active" not in columns:
        statements.append("ALTER TABLE plan ADD COLUMN rule_keys_active TEXT")
    if "params_used" not in columns:
        statements.append("ALTER TABLE plan ADD COLUMN params_used TEXT")
    for stmt in statements:
        session.exec(text(stmt))
    if statements:
        session.commit()


def ensure_subject_columns(session: Session) -> None:
    info = session.exec(text("PRAGMA table_info(subject)")).all()
    columns = {row[1] for row in info}
    if "alias_subject_id" not in columns:
        session.exec(text("ALTER TABLE subject ADD COLUMN alias_subject_id INTEGER"))
        session.commit()


def ensure_requirement_columns(session: Session) -> None:
    ensure_requirement_columns_db(session)


def ensure_plan_schema(session: Session) -> None:
    ensure_plan_period_columns(session)
    ensure_plan_room_column(session)
    ensure_plan_metadata_columns(session)
    ensure_subject_columns(session)
    ensure_requirement_columns(session)
