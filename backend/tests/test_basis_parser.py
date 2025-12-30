from __future__ import annotations

import json
import unittest

import pandas as pd
from sqlmodel import SQLModel, Session, create_engine

from backend.app.domain.planner.basis_parser import BasisPlanParser, BasisPlanContext
from backend.app.models import Account, BasisPlan, PlanningPeriod


class BasisPlanParserTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            account = Account(name="Test", description="Demo")
            session.add(account)
            session.commit()
            session.refresh(account)
            period = PlanningPeriod(account_id=account.id, name="2024", is_active=True)
            session.add(period)
            session.commit()
            session.refresh(period)
            payload = {
                "meta": {"slots": [{"label": "Slot 1", "isPause": False}]},
                "classes": {"1": {"allowed": {"Mo": [True]}}},
                "fixed": {"1": [{"subjectId": 1, "day": "mon", "slot": 0}]},
                "flexible": {"1": [{"subjectId": 1, "slots": [{"day": "tue", "slot": 1}]}]},
            }
            basis = BasisPlan(
                account_id=account.id,
                planning_period_id=period.id,
                data=json.dumps(payload),
            )
            session.add(basis)
            session.commit()
            self.account_id = account.id
            self.period_id = period.id
        self.session = Session(self.engine)

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def test_parse_produces_fixed_and_flexible_slots(self) -> None:
        parser = BasisPlanParser(self.session)
        df = pd.DataFrame(
            [{"Klasse": "1A", "Fach": "Mathe", "Lehrer": "Frau", "Wochenstunden": 2}]
        )
        df.index = [0]
        context = parser.parse(
            self.account_id,
            self.period_id,
            df,
            list(df.index),
            {1: "1A"},
            {1: "Mathe"},
        )
        self.assertIsInstance(context, BasisPlanContext)
        self.assertEqual(context.slots_meta[0].label, "Slot 1")
        self.assertIn(0, context.fixed_slot_map)
        self.assertEqual(context.fixed_slot_map[0][0], ("Mo", 0))
        lookup_key = ("1A", "Di", 1)
        self.assertIn(lookup_key, context.flexible_slot_lookup)
        self.assertTrue(context.flexible_slot_limits[lookup_key])
