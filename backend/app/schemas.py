from __future__ import annotations

from datetime import datetime, date
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field, EmailStr

from .models import AccountRole


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
    version_id: Optional[int] = None
    comment: Optional[str] = None
    dry_run: bool = False
    params: GenerateParams = Field(default_factory=GenerateParams)


class PlanUpdateRequest(BaseModel):
    name: Optional[str] = None
    comment: Optional[str] = None


class PlanSlotOut(BaseModel):
    class_id: int
    tag: str
    stunde: int
    subject_id: int
    teacher_id: int
    room_id: Optional[int] = None
    room_name: Optional[str] = None
    is_fixed: bool | None = None
    is_flexible: bool | None = None


class SlotMeta(BaseModel):
    index: int
    label: str
    start: Optional[str] = None
    end: Optional[str] = None
    is_pause: bool = False


class PlanSummary(BaseModel):
    id: int
    name: str
    status: str
    score: float | None
    objective_value: float | None
    created_at: datetime
    version_id: Optional[int] = None
    comment: Optional[str] = None
    rule_profile_id: Optional[int] = None
    rule_keys_active: List[str] = Field(default_factory=list)


class PlanDetail(BaseModel):
    id: int
    name: str
    status: str
    score: float | None
    objective_value: float | None
    created_at: datetime
    version_id: Optional[int] = None
    comment: Optional[str] = None
    rule_profile_id: Optional[int] = None
    slots: List[PlanSlotOut] = Field(default_factory=list)
    slots_meta: List[SlotMeta] = Field(default_factory=list)
    rules_snapshot: Optional[Dict[str, Union[int, bool]]] = None
    rule_keys_active: List[str] = Field(default_factory=list)
    params_used: Optional[GenerateParams] = None
    planning_period_id: Optional[int] = None


class GenerateResponse(BaseModel):
    plan_id: Optional[int]
    status: str
    score: float | None
    objective_value: float | None
    slots: List[PlanSlotOut]
    slots_meta: List[SlotMeta] = Field(default_factory=list)
    rules_snapshot: Dict[str, Union[int, bool]] = Field(default_factory=dict)
    rule_keys_active: List[str] = Field(default_factory=list)
    params_used: GenerateParams
    planning_period_id: Optional[int] = None


class PlanSlotsUpdateRequest(BaseModel):
    slots: List[PlanSlotOut]


class PlanningPeriodBase(BaseModel):
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool = False


class PlanningPeriodCreate(PlanningPeriodBase):
    pass


class PlanningPeriodUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None


class PlanningPeriodCloneRequest(BaseModel):
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool = False
    copy_curriculum: bool = True
    copy_requirements: bool = True
    copy_basisplan: bool = True
    copy_versions: bool = True


class PlanningPeriodOut(PlanningPeriodBase):
    id: int
    account_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Backup/export schemas
class BackupTeacher(BaseModel):
    name: Optional[str] = None
    kuerzel: Optional[str] = None
    color: Optional[str] = None
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
    alias_subject: Optional[str] = None


class BackupCurriculumItem(BaseModel):
    class_name: str
    subject_name: str
    wochenstunden: int
    participation: Optional[str] = None
    doppelstunde: Optional[str] = None
    nachmittag: Optional[str] = None


class BackupRequirementItem(BaseModel):
    class_name: str
    subject_name: str
    teacher_name: str
    wochenstunden: int
    doppelstunde: Optional[str] = None  # "muss"|"kann"|"nein"
    nachmittag: Optional[str] = None    # "muss"|"kann"|"nein"
    version_name: Optional[str] = None
    participation: Optional[str] = None
    config_source: Optional[str] = None


class BackupRoom(BaseModel):
    name: str
    type: Optional[str] = None
    capacity: Optional[int] = None


class UserAccountLink(BaseModel):
    account_id: int
    account_name: str
    role: str


class UserProfile(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    is_superuser: bool = False
    accounts: List[UserAccountLink] = Field(default_factory=list)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    expires_in: int


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    account_id: Optional[int] = None
    role: AccountRole = AccountRole.teacher
    is_superuser: bool = False


class AdminUserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str]
    is_superuser: bool
    created_at: datetime
    account_id: Optional[int]
    account_name: Optional[str] = None
    role: AccountRole

    class Config:
        from_attributes = True


class AccountCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    admin_email: EmailStr
    admin_password: str
    admin_full_name: Optional[str] = None


class AccountOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
    admin_email: Optional[EmailStr] = None

    class Config:
        from_attributes = True


class AccountUserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: AccountRole = AccountRole.teacher
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


class SetupExport(BaseModel):
    teachers: List[BackupTeacher] = Field(default_factory=list)
    classes: List[BackupClass] = Field(default_factory=list)
    subjects: List[BackupSubject] = Field(default_factory=list)
    rooms: List[BackupRoom] = Field(default_factory=list)
    curriculum: List[BackupCurriculumItem] = Field(default_factory=list)
    rule_profiles: List[dict] = Field(default_factory=list)


class DistributionVersionExport(BaseModel):
    name: str
    comment: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DistributionExport(BaseModel):
    version: DistributionVersionExport
    requirements: List[BackupRequirementItem] = Field(default_factory=list)


class BasisPlanExport(BaseModel):
    name: str
    updated_at: datetime
    data: BasisPlanData


class PlanExportMetadata(BaseModel):
    name: str
    status: str
    score: Optional[float] = None
    objective_value: Optional[float] = None
    created_at: datetime
    comment: Optional[str] = None
    version_name: Optional[str] = None
    rule_profile_name: Optional[str] = None
    rule_keys_active: List[str] = Field(default_factory=list)
    rules_snapshot: Optional[Dict[str, Any]] = None
    params_used: Optional[Dict[str, Any]] = None


class PlanSlotExport(BaseModel):
    class_name: str
    subject_name: str
    teacher_name: str
    room_name: Optional[str] = None
    tag: str
    stunde: int
    is_fixed: Optional[bool] = None
    is_flexible: Optional[bool] = None


class PlanExportItem(BaseModel):
    plan: PlanExportMetadata
    slots: List[PlanSlotExport] = Field(default_factory=list)


class PlansExport(BaseModel):
    plans: List[PlanExportItem] = Field(default_factory=list)


class BasisPlanData(BaseModel):
    classes: Dict[str, Any] = Field(default_factory=dict)
    rooms: Dict[str, Any] = Field(default_factory=dict)
    meta: Dict[str, Any] = Field(default_factory=dict)
    windows: Dict[str, Any] = Field(default_factory=dict)
    fixed: Dict[str, Any] = Field(default_factory=dict)
    flexible: Dict[str, Any] = Field(default_factory=dict)


class SlotDefinition(BaseModel):
    label: str
    start: Optional[str] = None
    end: Optional[str] = None
    is_pause: bool = False


class SchoolSettingsBase(BaseModel):
    name: Optional[str] = None
    short_name: Optional[str] = None
    street: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    school_type: Optional[str] = None
    organization_type: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class SchoolSettingsOut(SchoolSettingsBase):
    account_id: int
    default_days: List[str] = Field(default_factory=list)
    default_slots: List[SlotDefinition] = Field(default_factory=list)


class SchoolSettingsUpdate(SchoolSettingsBase):
    default_days: Optional[List[str]] = None
    default_slots: Optional[List[SlotDefinition]] = None

    class Config:
        extra = "allow"


class BasisPlanUpdate(BaseModel):
    name: Optional[str] = None
    data: Optional[BasisPlanData] = None


class BasisPlanOut(BaseModel):
    id: int
    name: str
    data: Optional[BasisPlanData] = None
    updated_at: datetime
    planning_period_id: Optional[int] = None


class BasisPlanPreviewRequest(BaseModel):
    payload: Optional[BasisPlanData] = None
