from __future__ import annotations

import json
import unittest

from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine, select
from sqlalchemy.pool import StaticPool

from backend.app.main import app
from backend.app.database import get_session
from backend.app.core.security import require_active_user, set_current_user
from backend.app.domain.accounts.service import (
    ensure_default_account,
    ensure_default_admin,
    ensure_default_planning_period,
)
from backend.app.models import (
    Account,
    Class,
    Plan,
    PlanSlot,
    PlanningPeriod,
    Requirement,
    RuleProfile,
    Subject,
    Teacher,
    User,
    DoppelstundeEnum,
    NachmittagEnum,
)
from backend.app.schemas import PlanSlotsUpdateRequest, PlanSlotOut, PlanUpdateRequest

# Ensure services use the in-memory engine as well
import backend.app.database as database_module
import backend.app.domain.planner.service as planner_service_module


class _DummyVar:
    def __init__(self, value: int) -> None:
        self.value = value


class _TestPlannerSolver:
    def solve(self, inputs):
        fid = inputs["FACH_ID"][0]
        plan_matrix = {(fid, "Mo", 0): _DummyVar(1)}
        from ortools.sat.python import cp_model

        class _Solver:
            def __init__(self):
                self._objective = 1.0

            def Value(self, var):
                return getattr(var, "value", 0)

            def ObjectiveValue(self):
                return self._objective

            def ResponseStats(self):
                return "dummy"

        return {
            "status": cp_model.OPTIMAL,
            "solver": _Solver(),
            "model": None,
            "plan": plan_matrix,
            "score": 1.0,
        }


TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
database_module.engine = TEST_ENGINE
planner_service_module.OrToolsPlannerSolver = _TestPlannerSolver


def override_get_session():
    with Session(TEST_ENGINE) as session:
        yield session


def override_active_user():
    with Session(TEST_ENGINE) as session:
        user = session.exec(select(User).order_by(User.id)).first()
        if not user:
            user = User(email="admin@example.com", full_name="Admin", is_active=True, is_superuser=True)
            session.add(user)
            session.commit()
            session.refresh(user)
        set_current_user(user)
        return user


app.dependency_overrides[get_session] = override_get_session
app.dependency_overrides[require_active_user] = override_active_user


class PlansRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        SQLModel.metadata.drop_all(TEST_ENGINE)
        SQLModel.metadata.create_all(TEST_ENGINE)
        self._ensure_defaults()
        with Session(TEST_ENGINE) as session:
            self.account = session.exec(select(Account).order_by(Account.id)).first()
            self.period = session.exec(
                select(PlanningPeriod).where(PlanningPeriod.account_id == self.account.id)
            ).first()

    def _ensure_defaults(self) -> None:
        with Session(TEST_ENGINE) as session:
            account = ensure_default_account(session)
            ensure_default_admin(session, account)
            ensure_default_planning_period(session, account)
            existing = session.exec(select(RuleProfile).where(RuleProfile.account_id == account.id)).first()
            if not existing:
                session.add(RuleProfile(name="Default", account_id=account.id))
                session.commit()

    def _create_plan_payload(self) -> dict:
        with Session(TEST_ENGINE) as session:
            teacher = Teacher(account_id=self.account.id, name="Frau Plan")
            school_class = Class(account_id=self.account.id, name="1A")
            subject = Subject(account_id=self.account.id, name="Mathe")
            session.add_all([teacher, school_class, subject])
            session.commit()
            session.refresh(teacher)
            session.refresh(school_class)
            session.refresh(subject)

            plan = Plan(
                account_id=self.account.id,
                planning_period_id=self.period.id,
                name="Plan Alpha",
                status="OPTIMAL",
                score=1.0,
            )
            session.add(plan)
            session.commit()
            session.refresh(plan)

            slot = PlanSlot(
                account_id=self.account.id,
                plan_id=plan.id,
                class_id=school_class.id,
                subject_id=subject.id,
                teacher_id=teacher.id,
                tag="Mo",
                stunde=1,
                planning_period_id=self.period.id,
            )
            session.add(slot)
            session.commit()

            return {
                "plan_id": plan.id,
                "class_id": school_class.id,
                "subject_id": subject.id,
                "teacher_id": teacher.id,
            }

    def _create_requirement(self, class_id: int, subject_id: int, teacher_id: int) -> None:
        with Session(TEST_ENGINE) as session:
            requirement = Requirement(
                account_id=self.account.id,
                class_id=class_id,
                subject_id=subject_id,
                teacher_id=teacher_id,
                planning_period_id=self.period.id,
                wochenstunden=2,
                doppelstunde=DoppelstundeEnum.kann,
                nachmittag=NachmittagEnum.kann,
            )
            session.add(requirement)
            session.commit()

    def test_list_plans_http(self) -> None:
        self._create_plan_payload()
        with TestClient(app) as client:
            resp = client.get(
                "/plans",
                params={"account_id": self.account.id, "planning_period_id": self.period.id},
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)

    def test_get_plan_http(self) -> None:
        data = self._create_plan_payload()
        with TestClient(app) as client:
            resp = client.get(
                f"/plans/{data['plan_id']}",
                params={"account_id": self.account.id, "planning_period_id": self.period.id},
            )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(payload["id"], data["plan_id"])

    def test_generate_plan_dry_run_success(self) -> None:
        data = self._create_plan_payload()
        self._create_requirement(data["class_id"], data["subject_id"], data["teacher_id"])
        request_payload = {
            "name": "DryRun",
            "dry_run": True,
            "params": {},
        }
        with TestClient(app) as client:
            resp = client.post(
                "/plans/generate",
                params={"account_id": self.account.id, "planning_period_id": self.period.id},
                json=request_payload,
            )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertIsNone(payload["plan_id"])
        self.assertEqual(payload["status"], "OPTIMAL")
        self.assertEqual(len(payload["slots"]), 1)

    def test_generate_plan_returns_400_when_no_requirements(self) -> None:
        request_payload = {
            "name": "DryRun",
            "dry_run": True,
            "params": {},
        }
        with TestClient(app) as client:
            resp = client.post(
                "/plans/generate",
                params={"account_id": self.account.id, "planning_period_id": self.period.id},
                json=request_payload,
            )
        self.assertEqual(resp.status_code, 400)
        payload = resp.json()
        self.assertIn("detail", payload)

    def test_update_plan_http(self) -> None:
        data = self._create_plan_payload()
        with TestClient(app) as client:
            resp = client.put(
                f"/plans/{data['plan_id']}",
                params={"account_id": self.account.id, "planning_period_id": self.period.id},
                json={"name": "Plan Beta", "comment": "Notiz"},
            )
        self.assertEqual(resp.status_code, 200)
        updated = resp.json()
        self.assertEqual(updated["name"], "Plan Beta")

    def test_replace_plan_slots_http(self) -> None:
        data = self._create_plan_payload()
        payload = PlanSlotsUpdateRequest(
            slots=[
                PlanSlotOut(
                    class_id=data["class_id"],
                    subject_id=data["subject_id"],
                    teacher_id=data["teacher_id"],
                    tag="Di",
                    stunde=2,
                )
            ]
        )
        with TestClient(app) as client:
            resp = client.put(
                f"/plans/{data['plan_id']}/slots",
                params={"account_id": self.account.id, "planning_period_id": self.period.id},
                json=payload.model_dump(),
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["slots"][0]["tag"], "Di")

    def test_delete_plan_http(self) -> None:
        data = self._create_plan_payload()
        with TestClient(app) as client:
            resp = client.delete(
                f"/plans/{data['plan_id']}",
                params={"account_id": self.account.id, "planning_period_id": self.period.id},
            )
        self.assertEqual(resp.status_code, 204)
        with Session(TEST_ENGINE) as session:
            remaining = session.get(Plan, data["plan_id"])
            self.assertIsNone(remaining)

    def test_analyze_inputs_http(self) -> None:
        data = self._create_plan_payload()
        self._create_requirement(data["class_id"], data["subject_id"], data["teacher_id"])
        with TestClient(app) as client:
            resp = client.get(
                "/plans/analyze",
                params={"account_id": self.account.id, "planning_period_id": self.period.id},
            )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["ok"])

    def test_generate_plan_without_requirements_returns_400(self) -> None:
        with TestClient(app) as client:
            resp = client.post(
                "/plans/generate",
                params={"account_id": self.account.id, "planning_period_id": self.period.id},
                json={"name": "HTTP Plan", "dry_run": True},
            )
        self.assertEqual(resp.status_code, 400)

    def test_generate_plan_dry_run_success(self) -> None:
        data = self._create_plan_payload()
        self._create_requirement(data["class_id"], data["subject_id"], data["teacher_id"])
        with TestClient(app) as client:
            resp = client.post(
                "/plans/generate",
                params={"account_id": self.account.id, "planning_period_id": self.period.id},
                json={"name": "DryRun", "dry_run": True},
            )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(payload["plan_id"], None)
        self.assertGreater(len(payload["slots"]), 0)


if __name__ == "__main__":
    unittest.main()
