from __future__ import annotations

from typing import Protocol, TypedDict

from ortools.sat.python import cp_model
import pandas as pd


class SolverInputs(TypedDict, total=False):
    df: pd.DataFrame
    FACH_ID: list[int]
    KLASSEN: list[str]
    LEHRER: list[str]
    regeln: dict[str, int | bool]
    teacher_workdays: dict[int, dict[str, bool]]
    pool_teacher_names: set[str]
    room_plan: dict[int, dict[str, list[bool]]]
    fixed_slots: dict[int, list[tuple[str, int]]]
    flexible_groups: list[dict[str, object]]
    flexible_slot_limits: dict[tuple[str, str, int], set[int]]
    class_windows: dict[str, dict[str, list[bool]]]
    pause_slots: set[int]
    slots_per_day: int
    multi_start: bool
    max_attempts: int
    patience: int
    time_per_attempt: float
    randomize_search: bool
    base_seed: int
    seed_step: int
    use_value_hints: bool


class SolverOutputs(TypedDict):
    status: int
    solver: cp_model.CpSolver
    model: cp_model.CpModel
    plan: dict[tuple[int, str, int], cp_model.IntVar]
    score: float


class PlannerSolver(Protocol):
    def solve(self, inputs: SolverInputs) -> SolverOutputs:
        ...
