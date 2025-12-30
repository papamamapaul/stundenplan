#!/usr/bin/env python3
"""
Basisplan Preview CLI
---------------------
Usage:
    python scripts/preview_basisplan.py [--file basisplan.json] [--account 1] [--period 1]

If --file is provided, the script parses the given JSON payload; otherwise it loads the
saved basis plan for the account/period from backend.db. The parsed context (fixed slots,
flexible groups, room plan, etc.) is printed as JSON, matching the /basisplan/debug/parse output.

Example custom payload (basisplan.json):
{
    "meta": {"slots": [{"label": "1. Stunde"}, {"label": "2. Stunde"}]},
    "classes": {},
    "rooms": {},
    "windows": {},
    "fixed": {},
    "flexible": {}
}
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlmodel import Session, create_engine, select

from backend.app.domain.planner.basis_parser import BasisPlanParser
from backend.app.domain.planner.data_access import fetch_requirements_dataframe
from backend.app.models import BasisPlan, Class, Subject
from backend.app.schemas import BasisPlanData


def _load_payload(session: Session, account_id: int, planning_period_id: int) -> dict:
    row = session.exec(
        select(BasisPlan).where(
            BasisPlan.account_id == account_id,
            BasisPlan.planning_period_id == planning_period_id,
        )
    ).first()
    if not row:
        return BasisPlanData().model_dump()
    try:
        raw = json.loads(row.data) if row.data else {}
    except (TypeError, json.JSONDecodeError):
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    return BasisPlanData(**raw).model_dump()


def _serialize_context(context) -> dict:
    def convert(value):
        if isinstance(value, set):
            return sorted(value)
        if isinstance(value, dict):
            return {k: convert(v) for k, v in value.items()}
        if isinstance(value, list):
            return [convert(v) for v in value]
        return value

    return {
        "room_plan": context.room_plan,
        "class_windows": context.class_windows_by_name,
        "class_fixed_lookup": convert(context.class_fixed_lookup),
        "flexible_slot_lookup": convert(context.flexible_slot_lookup),
        "flexible_slot_limits": convert(context.flexible_slot_limits),
        "flexible_groups": context.flexible_groups,
        "fixed_slot_map": convert(context.fixed_slot_map),
        "slots_per_day": context.slots_per_day,
        "pause_slots": convert(context.pause_slots),
        "slots_meta": [slot.model_dump() for slot in context.slots_meta],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview parsed basis plan context.")
    parser.add_argument("--file", type=Path, help="Optional path to a basisplan JSON file.")
    parser.add_argument("--account", type=int, default=1, help="Account ID (default: 1)")
    parser.add_argument("--period", type=int, default=1, help="Planning period ID (default: 1)")
    parser.add_argument("--database", type=str, default="backend.db", help="SQLite database path (default: backend.db)")
    args = parser.parse_args()

    engine = create_engine(f"sqlite:///{args.database}", connect_args={"check_same_thread": False})
    with Session(engine) as session:
        parser_service = BasisPlanParser(session)
        payload = None
        if args.file:
            payload = json.loads(args.file.read_text(encoding="utf-8"))
        else:
            payload = _load_payload(session, args.account, args.period)
        df, FACH_ID, _, _, _, _ = fetch_requirements_dataframe(
            session,
            account_id=args.account,
            planning_period_id=args.period,
            version_id=None,
        )
        if df is None or df.empty:
            import pandas as pd

            df = pd.DataFrame(columns=["Klasse", "Fach", "Lehrer", "Wochenstunden"])
            FACH_ID = []
        class_rows = session.exec(select(Class).where(Class.account_id == args.account)).all()
        subject_rows = session.exec(select(Subject).where(Subject.account_id == args.account)).all()
        class_id_to_name = {row.id: row.name for row in class_rows}
        subject_id_to_name = {row.id: row.name for row in subject_rows}
        context = parser_service.parse_from_payload(payload, df, FACH_ID, class_id_to_name, subject_id_to_name)
        print(json.dumps(_serialize_context(context), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
