from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class GenerateParams(BaseModel):
    # Suche/Heuristik
    multi_start: bool = True
    max_attempts: int = 10
    patience: int = 3
    time_per_attempt: float = 5.0
    randomize_search: bool = True
    base_seed: int = 42
    seed_step: int = 17
    use_value_hints: bool = True


class GenerateRequest(BaseModel):
    name: str = Field(description="Name des Plans")
    rule_profile_id: Optional[int] = None
    override_rules: Optional[Dict[str, int | bool]] = None
    params: GenerateParams = Field(default_factory=GenerateParams)


class PlanSlotOut(BaseModel):
    class_id: int
    tag: str
    stunde: int
    subject_id: int
    teacher_id: int


class GenerateResponse(BaseModel):
    plan_id: int
    status: str
    score: float | None
    objective_value: float | None
    slots: List[PlanSlotOut]


# Backup/export schemas
class BackupTeacher(BaseModel):
    name: Optional[str] = None
    kuerzel: Optional[str] = None
    deputat_soll: Optional[int] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    deputat: Optional[int] = None
    work_mo: Optional[bool] = None
    work_di: Optional[bool] = None
    work_mi: Optional[bool] = None
    work_do: Optional[bool] = None
    work_fr: Optional[bool] = None


class BackupClass(BaseModel):
    name: str
    homeroom_teacher: Optional[str] = None  # kuerzel preferred; fallback name


class BackupSubject(BaseModel):
    name: str
    kuerzel: Optional[str] = None
    color: Optional[str] = None
    default_doppelstunde: Optional[str] = None
    default_nachmittag: Optional[str] = None
    required_room: Optional[str] = None
    is_bandfach: Optional[bool] = None
    is_ag_foerder: Optional[bool] = None


class BackupCurriculumItem(BaseModel):
    class_name: str
    subject_name: str
    wochenstunden: int


class BackupRequirementItem(BaseModel):
    class_name: str
    subject_name: str
    teacher_name: str
    wochenstunden: int
    doppelstunde: Optional[str] = None  # "muss"|"kann"|"nein"
    nachmittag: Optional[str] = None    # "muss"|"kann"|"nein"
    version_name: Optional[str] = None


class BackupRoom(BaseModel):
    name: str
    type: Optional[str] = None
    capacity: Optional[int] = None
    is_classroom: Optional[bool] = None


class BackupPayload(BaseModel):
    teachers: Optional[List[BackupTeacher]] = None
    classes: Optional[List[BackupClass]] = None
    subjects: Optional[List[BackupSubject]] = None
    rooms: Optional[List[BackupRoom]] = None
    curriculum: Optional[List[BackupCurriculumItem]] = None
    requirements: Optional[List[BackupRequirementItem]] = None
    rule_profiles: Optional[List[dict]] = None
    versions: Optional[List[dict]] = None  # list of {name, comment}


class BasisPlanData(BaseModel):
    classes: Dict[str, Any] = Field(default_factory=dict)
    rooms: Dict[str, Any] = Field(default_factory=dict)
    meta: Dict[str, Any] = Field(default_factory=dict)
    windows: Dict[str, Any] = Field(default_factory=dict)
    fixed: Dict[str, Any] = Field(default_factory=dict)
    flexible: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        extra = "allow"


class BasisPlanOut(BaseModel):
    id: int
    name: str
    data: Optional[BasisPlanData] = None
    updated_at: datetime


class BasisPlanUpdate(BaseModel):
    name: Optional[str] = None
    data: Optional[BasisPlanData] = None
