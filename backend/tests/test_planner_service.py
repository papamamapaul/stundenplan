from __future__ import annotations

import json
import unittest

from fastapi import HTTPException
from ortools.sat.python import cp_model
from sqlmodel import SQLModel, Session, create_engine, select

from backend.app.domain.planner.service import PlannerService
from backend.app.models import (
    Account,
    Class,
    Plan,
    PlanSlot,
    PlanningPeriod,
    Requirement,
    Room,
    Subject,
    Teacher,
    DoppelstundeEnum,
    NachmittagEnum,
)
from backend.app.schemas import GenerateParams, GenerateRequest


class _DummyVar:
    def __init__(self, value: int) -> None:
        self.value = value


class _DummySolver:
    def __init__(self, objective: float = 1.0) -> None:
        self._objective = objective

    def Value(self, var: _DummyVar) -> int:
        return getattr(var, "value", 0)

    def ObjectiveValue(self) -> float:
        return self._objective

    def ResponseStats(self) -> str:
        return "dummy"


class _FakePlannerSolver:
    """Deterministic solver stub returning a single slot for the first requirement."""

    def solve(self, inputs):
        fid = inputs["FACH_ID"][0]
        plan_matrix = {(fid, "Mo", 0): _DummyVar(1)}
        return {
            "status": cp_model.OPTIMAL,
            "solver": _DummySolver(objective=42.0),
            "model": object(),
            "plan": plan_matrix,
            "score": 4.0,
        }


class _FailingPlannerSolver:
    def solve(self, inputs):
        return {
            "status": cp_model.INFEASIBLE,
            "solver": _DummySolver(),
            "model": object(),
            "plan": {},
            "score": None,
        }


class _CapturingPlannerSolver(_FakePlannerSolver):
    """Fake solver that records the last inputs for assertions."""

    def __init__(self) -> None:
        super().__init__()
        self.last_inputs = None

    def solve(self, inputs):
        self.last_inputs = inputs
        return super().solve(inputs)


class PlannerServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self._seed_baseline_data()
        self.service = PlannerService(self.session, solver=_FakePlannerSolver())

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def _seed_baseline_data(self) -> None:
        account = Account(name="Test Account")
        self.session.add(account)
        self.session.commit()

        period = PlanningPeriod(name="Periode", account_id=account.id, is_active=True)
        self.session.add(period)
        self.session.commit()

        room = Room(account_id=account.id, name="Raum 1", is_classroom=True)
        teacher = Teacher(account_id=account.id, name="Frau Sommer", kuerzel="FS")
        school_class = Class(account_id=account.id, name="1A")
        subject = Subject(account_id=account.id, name="Mathe", required_room_id=None)

        self.session.add_all([room, teacher, school_class, subject])
        self.session.commit()

        requirement = Requirement(
            account_id=account.id,
            class_id=school_class.id,
            subject_id=subject.id,
            teacher_id=teacher.id,
            planning_period_id=period.id,
            wochenstunden=2,
            doppelstunde=DoppelstundeEnum.kann,
            nachmittag=NachmittagEnum.kann,
        )
        self.session.add(requirement)
        self.session.commit()

        # Persist for later assertions
        self.account = account
        self.period = period
        self.school_class = school_class
        self.subject = subject
        self.teacher = teacher

    def test_generate_plan_persists_plan_and_slots(self) -> None:
        request = GenerateRequest(name="Plan Alpha", params=GenerateParams())

        response = self.service.generate_plan(request, self.account.id, self.period.id)

        self.assertIsNotNone(response.plan_id)
        self.assertEqual(response.status, "OPTIMAL")
        self.assertEqual(len(response.slots), 1)

        plan = self.session.get(Plan, response.plan_id)
        self.assertIsNotNone(plan)
        self.assertEqual(plan.name, "Plan Alpha")

        slots = self.session.exec(select(PlanSlot).where(PlanSlot.plan_id == plan.id)).all()
        self.assertEqual(len(slots), 1)
        slot = slots[0]
        self.assertEqual(slot.class_id, self.school_class.id)
        self.assertEqual(slot.subject_id, self.subject.id)
        self.assertEqual(slot.teacher_id, self.teacher.id)
        self.assertEqual(slot.stunde, 1)

    def test_dry_run_does_not_persist_plan(self) -> None:
        request = GenerateRequest(name="Dry Plan", dry_run=True, params=GenerateParams())

        response = self.service.generate_plan(request, self.account.id, self.period.id)

        self.assertIsNone(response.plan_id)
        self.assertEqual(len(response.slots), 1)
        plans = self.session.exec(select(Plan)).all()
        self.assertEqual(len(plans), 0)
        slots = self.session.exec(select(PlanSlot)).all()
        self.assertEqual(len(slots), 0)

    def test_generate_plan_requires_requirements(self) -> None:
        rows = self.session.exec(select(Requirement)).all()
        for row in rows:
            self.session.delete(row)
        self.session.commit()

        with self.assertRaises(HTTPException) as ctx:
            self.service.generate_plan(
                GenerateRequest(name="NoReqs", params=GenerateParams()),
                self.account.id,
                self.period.id,
            )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_generate_plan_raises_on_infeasible_solver(self) -> None:
        failing_service = PlannerService(self.session, solver=_FailingPlannerSolver())
        with self.assertRaises(HTTPException) as ctx:
            failing_service.generate_plan(
                GenerateRequest(name="Failing", params=GenerateParams()),
                self.account.id,
                self.period.id,
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_analyze_requirements_returns_class_and_teacher_counts(self) -> None:
        analysis = self.service.analyze_requirements(
            version_id=None,
            account_id=self.account.id,
            planning_period_id=self.period.id,
        )

        self.assertTrue(analysis["ok"])
        self.assertEqual(analysis["classes"][0]["klasse"], "1A")
        self.assertEqual(analysis["classes"][0]["stunden"], 2)
        self.assertEqual(analysis["teachers"][0]["lehrer"], "Frau Sommer")
        self.assertEqual(analysis["teachers"][0]["stunden"], 2)
        self.assertIn("rules", analysis)

    def test_generate_plan_applies_override_rules(self) -> None:
        capturing_solver = _CapturingPlannerSolver()
        service = PlannerService(self.session, solver=capturing_solver)
        request = GenerateRequest(
            name="Override Plan",
            override_rules={"keine_lehrerkonflikte": False},
            params=GenerateParams(),
        )

        response = service.generate_plan(request, self.account.id, self.period.id)

        self.assertIsNotNone(capturing_solver.last_inputs)
        regeln = capturing_solver.last_inputs["regeln"]
        self.assertFalse(regeln["keine_lehrerkonflikte"])
        self.assertNotIn("keine_lehrerkonflikte", response.rule_keys_active)
        plan = self.session.exec(select(Plan).where(Plan.id == response.plan_id)).first()
        self.assertIsNotNone(plan)
        snapshot = json.loads(plan.rules_snapshot)
        self.assertFalse(snapshot["keine_lehrerkonflikte"])


if __name__ == "__main__":
    unittest.main()
