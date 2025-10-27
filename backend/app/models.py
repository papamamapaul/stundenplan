from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class DoppelstundeEnum(str, Enum):
    muss = "muss"
    kann = "kann"
    nein = "nein"


class RequirementConfigSourceEnum(str, Enum):
    subject = "subject"
    manual = "manual"
    import_batch = "import"


class NachmittagEnum(str, Enum):
    muss = "muss"
    kann = "kann"
    nein = "nein"


class AccountRole(str, Enum):
    owner = "owner"
    planner = "planner"
    viewer = "viewer"
    teacher = "teacher"


class Account(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    description: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    full_name: Optional[str] = Field(default=None)
    password_hash: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text))
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AccountUser(SQLModel, table=True):
    account_id: int = Field(foreign_key="account.id", primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    role: AccountRole = Field(default=AccountRole.owner)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Teacher(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    name: str = Field(index=True)
    kuerzel: Optional[str] = Field(default=None, index=True)
    deputat_soll: Optional[int] = Field(default=None)
    # New fields for management UI
    first_name: Optional[str] = Field(default=None, index=True)
    last_name: Optional[str] = Field(default=None, index=True)
    deputat: Optional[int] = Field(default=None)
    work_mo: bool = Field(default=True)
    work_di: bool = Field(default=True)
    work_mi: bool = Field(default=True)
    work_do: bool = Field(default=True)
    work_fr: bool = Field(default=True)


class Class(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    name: str = Field(index=True)
    homeroom_teacher_id: Optional[int] = Field(default=None, foreign_key="teacher.id")


class Subject(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    name: str = Field(index=True)
    kuerzel: Optional[str] = Field(default=None, index=True)
    color: Optional[str] = Field(default=None)
    required_room_id: Optional[int] = Field(default=None, foreign_key="room.id")
    # Defaults for planning preferences
    default_doppelstunde: Optional[DoppelstundeEnum] = Field(default=None)
    default_nachmittag: Optional[NachmittagEnum] = Field(default=None)
    is_bandfach: bool = Field(default=False)
    is_ag_foerder: bool = Field(default=False)
    alias_subject_id: Optional[int] = Field(
        default=None,
        sa_column=sa.Column(sa.Integer, sa.ForeignKey("subject.id"), nullable=True),
    )


class RequirementParticipationEnum(str, Enum):
    curriculum = "curriculum"
    ag = "ag"


class Requirement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    class_id: int = Field(foreign_key="class.id")
    subject_id: int = Field(foreign_key="subject.id")
    teacher_id: int = Field(foreign_key="teacher.id")
    wochenstunden: int
    doppelstunde: DoppelstundeEnum = Field(default=DoppelstundeEnum.kann)
    nachmittag: NachmittagEnum = Field(default=NachmittagEnum.kann)
    participation: RequirementParticipationEnum = Field(default=RequirementParticipationEnum.curriculum)
    # Optional version grouping
    version_id: Optional[int] = Field(default=None, foreign_key="distributionversion.id")
    config_source: RequirementConfigSourceEnum = Field(default=RequirementConfigSourceEnum.subject)

    # Bewusste Vereinfachung: keine ORM-Relationships notwendig


class ClassSubject(SQLModel, table=True):
    """Stundentafel: Zuordnung Klasse ←→ Fach mit Wochenstunden.
    Lehrkraft ist hier nicht enthalten (nur Bedarf/Struktur).
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    class_id: int = Field(foreign_key="class.id")
    subject_id: int = Field(foreign_key="subject.id")
    wochenstunden: int
    participation: RequirementParticipationEnum = Field(default=RequirementParticipationEnum.curriculum)
    doppelstunde: Optional[DoppelstundeEnum] = Field(default=None)
    nachmittag: Optional[NachmittagEnum] = Field(default=None)


class RuleProfile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    name: str = Field(index=True)

    # Schalter (Default an die Streamlit-Defaults angelehnt)
    stundenbegrenzung: bool = True
    keine_hohlstunden: bool = True
    keine_hohlstunden_hard: bool = False
    nachmittag_regel: bool = True
    klassenlehrerstunde_fix: bool = True
    doppelstundenregel: bool = True
    einzelstunde_nur_rand: bool = True
    leseband_parallel: bool = True
    kuba_parallel: bool = True
    gleichverteilung: bool = True
    mittagsschule_vormittag: bool = True

    # Gewichte für Soft-Ziele
    W_GAPS_START: int = 2
    W_GAPS_INSIDE: int = 3
    W_EVEN_DIST: int = 1
    W_EINZEL_KANN: int = 5


class Plan(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    name: str
    rule_profile_id: Optional[int] = Field(default=None, foreign_key="ruleprofile.id")
    seed: Optional[int] = None
    status: str = "PENDING"  # cp_model status as string
    score: Optional[float] = None
    objective_value: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_favorite: bool = Field(default=False)
    comment: Optional[str] = Field(default=None)
    version_id: Optional[int] = Field(default=None, foreign_key="distributionversion.id")
    rules_snapshot: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text))
    rule_keys_active: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text))
    params_used: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text))


class PlanSlot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    plan_id: int = Field(foreign_key="plan.id")
    class_id: int = Field(foreign_key="class.id")
    tag: str  # 'Mo' | 'Di' | 'Mi' | 'Do' | 'Fr'
    stunde: int  # 1..8
    subject_id: int = Field(foreign_key="subject.id")
    teacher_id: int = Field(foreign_key="teacher.id")


class DistributionVersion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    name: str = Field(index=True)
    comment: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class BasisPlan(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    name: str = Field(default="Basisplan")
    # JSON payload as text (per-class rules, allowed slots, windows, fixed entries)
    data: Optional[str] = Field(default=None)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Room(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True, default=1)
    name: str = Field(index=True)
    type: Optional[str] = Field(default=None, index=True)  # z. B. Sporthalle, Schwimmhalle, Werkraum, Klassenraum
    capacity: Optional[int] = Field(default=None)
    is_classroom: bool = Field(default=False)
