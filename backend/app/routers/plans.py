from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlmodel import Session, select

from ..core.security import require_active_user
from ..database import get_session
from ..models import Plan, DistributionVersion
from ..schemas import (
    GenerateParams,
    GenerateRequest,
    GenerateResponse,
    PlanDetail,
    PlanSlotsUpdateRequest,
    PlanSummary,
    PlanUpdateRequest,
)
from ..domain.planner.rules_config import get_rule_definitions
from ..domain.planner.service import PlannerService
from ..domain.plans.service import PlanQueryService

router = APIRouter(prefix="/plans", tags=["plans"], dependencies=[Depends(require_active_user)])


def get_planner_service(session: Session = Depends(get_session)) -> PlannerService:
    return PlannerService(session)

def get_plan_query_service(session: Session = Depends(get_session)) -> PlanQueryService:
    return PlanQueryService(session)


@router.get("", response_model=List[PlanSummary])
def list_plans(
    limit: Optional[int] = None,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    plan_service: PlanQueryService = Depends(get_plan_query_service),
) -> List[PlanSummary]:
    return plan_service.list_plans_for_request(account_id, planning_period_id, limit)


@router.get("/rules")
def list_rules() -> dict:
    """Returns available rule switches and soft-weights with defaults and descriptions.
    Kept in sync with stundenplan_regeln.add_constraints expectations.
    """
    return get_rule_definitions()


@router.get("/analyze")
def analyze_inputs(
    version_id: Optional[int] = None,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    planner: PlannerService = Depends(get_planner_service),
) -> dict:
    """Returns a lightweight analysis of current data for planning: counts per class/subject,
    teacher loads vs deputat, and flags presence for DS/Nachmittag in requirements.
    """
    return planner.analyze_requirements(version_id, account_id, planning_period_id)

@router.post("/generate", response_model=GenerateResponse)
def generate_plan(
    req: GenerateRequest,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    planner: PlannerService = Depends(get_planner_service),
) -> GenerateResponse:
    return planner.generate_plan(req, account_id, planning_period_id)

@router.get("/{plan_id}", response_model=PlanDetail)
def get_plan(
    plan_id: int,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    plan_service: PlanQueryService = Depends(get_plan_query_service),
) -> PlanDetail:
    return plan_service.get_plan_detail_for_request(plan_id, account_id, planning_period_id)


@router.put("/{plan_id}", response_model=Plan)
def update_plan_metadata(
    plan_id: int,
    payload: PlanUpdateRequest,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    plan_service: PlanQueryService = Depends(get_plan_query_service),
) -> Plan:
    return plan_service.update_plan_metadata_for_request(plan_id, payload, account_id, planning_period_id)


@router.put("/{plan_id}/slots", response_model=PlanDetail)
def replace_plan_slots(
    plan_id: int,
    payload: PlanSlotsUpdateRequest,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    plan_service: PlanQueryService = Depends(get_plan_query_service),
) -> PlanDetail:
    return plan_service.replace_plan_slots_for_request(plan_id, payload, account_id, planning_period_id)


@router.delete("/{plan_id}", status_code=204)
def delete_plan(
    plan_id: int,
    account_id: Optional[int] = Query(None),
    planning_period_id: Optional[int] = Query(None),
    plan_service: PlanQueryService = Depends(get_plan_query_service),
) -> Response:
    plan_service.delete_plan_for_request(plan_id, account_id, planning_period_id)
    return Response(status_code=204)
