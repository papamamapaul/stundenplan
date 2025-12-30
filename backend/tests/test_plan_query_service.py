from __future__ import annotations

import json
import unittest

from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine, select

from backend.app.domain.plans.service import PlanQueryService
from backend.app.models import (
    Account,
    BasisPlan,
    Class,
    Plan,
    PlanSlot,
    PlanningPeriod,
    Subject,
    Teacher,
)
from backend.app.schemas import PlanSlotOut, PlanSlotsUpdateRequest, PlanUpdateRequest


class PlanQueryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self._seed_data()
        self.service = PlanQueryService(self.session)

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def _seed_data(self) -> None:
        account = Account(name="Test Account")
        self.session.add(account)
        self.session.commit()

        period = PlanningPeriod(account_id=account.id, name="Periode", is_active=True)
        self.session.add(period)
        self.session.commit()

        school_class = Class(account_id=account.id, name="1A")
        subject = Subject(account_id=account.id, name="Mathe")
        teacher = Teacher(account_id=account.id, name="Frau Test")
        self.session.add_all([school_class, subject, teacher])
        self.session.commit()

        plan = Plan(
            account_id=account.id,
            name="Plan 1",
            status="OPTIMAL",
            score=1.0,
            objective_value=1.0,
            rule_keys_active=json.dumps(["rule_a"]),
            planning_period_id=None,
        )
        self.session.add(plan)
        self.session.commit()

        slot = PlanSlot(
            account_id=account.id,
            plan_id=plan.id,
            planning_period_id=None,
            class_id=school_class.id,
            subject_id=subject.id,
            teacher_id=teacher.id,
            tag="Mo",
            stunde=1,
        )
        self.session.add(slot)
        self.session.commit()

        basis_payload = {
            "meta": {
                "slots": [
                    {"label": "1. Stunde", "start": "08:00", "end": "08:45", "isPause": False},
                    {"label": "2. Stunde", "start": "08:50", "end": "09:35", "isPause": False},
                ]
            }
        }
        basisplan = BasisPlan(
            account_id=account.id,
            planning_period_id=period.id,
            data=json.dumps(basis_payload),
        )
        self.session.add(basisplan)
        self.session.commit()

        self.account = account
        self.period = period
        self.plan = plan
        self.school_class = school_class
        self.subject = subject
        self.teacher = teacher

    def test_list_plans_updates_planning_period(self) -> None:
        summaries = self.service.list_plans(self.account, self.period, limit=None)

        self.assertEqual(len(summaries), 1)
        refreshed = self.session.get(Plan, self.plan.id)
        self.assertEqual(refreshed.planning_period_id, self.period.id)

    def test_get_plan_detail_returns_slots_and_meta(self) -> None:
        detail = self.service.get_plan_detail(self.plan.id, self.account, self.period)

        self.assertEqual(detail.id, self.plan.id)
        self.assertEqual(len(detail.slots), 1)
        self.assertEqual(detail.slots_meta[0].label, "1. Stunde")

    def test_replace_plan_slots_overwrites_existing(self) -> None:
        payload = PlanSlotsUpdateRequest(
            slots=[
                PlanSlotOut(
                    class_id=self.school_class.id,
                    tag="Di",
                    stunde=2,
                    subject_id=self.subject.id,
                    teacher_id=self.teacher.id,
                    room_id=None,
                )
            ]
        )

        detail = self.service.replace_plan_slots(self.plan.id, payload, self.account, self.period)

        self.assertEqual(len(detail.slots), 1)
        slot = detail.slots[0]
        self.assertEqual(slot.tag, "Di")
        self.assertEqual(slot.stunde, 2)
        rows = self.session.exec(
            select(PlanSlot).where(PlanSlot.plan_id == self.plan.id)
        ).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].tag, "Di")

    def test_update_plan_metadata_changes_fields(self) -> None:
        payload = PlanUpdateRequest(name="Plan Neu", comment="Neuer Kommentar")

        plan = self.service.update_plan_metadata(self.plan.id, payload, self.account, self.period)

        self.assertEqual(plan.name, "Plan Neu")
        self.assertEqual(plan.comment, "Neuer Kommentar")
        refreshed = self.session.get(Plan, self.plan.id)
        self.assertEqual(refreshed.name, "Plan Neu")

    def test_update_plan_metadata_rejects_duplicate_name(self) -> None:
        other = Plan(
            account_id=self.account.id,
            name="Taken",
            status="OPTIMAL",
            planning_period_id=self.period.id,
        )
        self.session.add(other)
        self.session.commit()

        with self.assertRaises(HTTPException):
            self.service.update_plan_metadata(
                self.plan.id,
                PlanUpdateRequest(name="Taken"),
                self.account,
                self.period,
            )

    def test_delete_plan_removes_rows(self) -> None:
        self.service.delete_plan(self.plan.id, self.account, self.period)

        self.assertIsNone(self.session.get(Plan, self.plan.id))
        rows = self.session.exec(select(PlanSlot).where(PlanSlot.plan_id == self.plan.id)).all()
        self.assertEqual(len(rows), 0)


if __name__ == "__main__":
    unittest.main()
