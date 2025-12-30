from __future__ import annotations

from typing import Dict, List, Optional, Tuple, Set
import logging

import pandas as pd
from ortools.sat.python import cp_model

from ...utils import TAGE

try:
    from stundenplan_regeln import add_constraints
except ImportError as exc:  # pragma: no cover
    raise RuntimeError("Regel-Engine 'stundenplan_regeln' fehlt im PYTHONPATH") from exc

solver_logger = logging.getLogger("stundenplan.solver")
if not solver_logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(levelname)s %(name)s: %(message)s")
    handler.setFormatter(formatter)
    solver_logger.addHandler(handler)
solver_logger.setLevel(logging.DEBUG)
solver_logger.propagate = True


def solve_best_plan(
    df: pd.DataFrame,
    FACH_ID: List[int],
    KLASSEN: List[str],
    LEHRER: List[str],
    regeln: Dict[str, int | bool],
    teacher_workdays: Optional[Dict[int, Dict[str, bool]]] = None,
    pool_teacher_names: Optional[Set[str]] = None,
    room_plan: Optional[Dict[int, Dict[str, List[bool]]]] = None,
    fixed_slots: Optional[Dict[int, List[Tuple[str, int]]]] = None,
    flexible_groups: Optional[List[Dict[str, object]]] = None,
    flexible_slot_limits: Optional[Dict[Tuple[str, str, int], Set[int]]] = None,
    class_windows: Optional[Dict[str, Dict[str, List[bool]]]] = None,
    pause_slots: Optional[Set[int]] = None,
    slots_per_day: int = 8,
    multi_start: bool = True,
    max_attempts: int = 10,
    patience: int = 3,
    time_per_attempt: float = 5.0,
    randomize_search: bool = True,
    base_seed: int = 42,
    seed_step: int = 17,
    use_value_hints: bool = True,
) -> Tuple[int, cp_model.CpSolver, cp_model.CpModel, Dict[Tuple[int, str, int], cp_model.IntVar], float]:
    slots_per_day = max(1, int(slots_per_day))

    def add_value_hints_evenly(model: cp_model.CpModel, plan: Dict, slots_per_day: int = 6, seed: int = 0) -> None:
        import random

        rnd = random.Random(seed)
        hinted = set()
        for fid in FACH_ID:
            need = int(df.loc[fid, "Wochenstunden"])
            if need <= 0:
                continue
            candidates = [(tag, s) for tag in TAGE for s in range(slots_per_day)]
            rnd.shuffle(candidates)
            for tag, s in candidates[:need]:
                var = plan.get((fid, tag, s))
                if var is not None and (fid, tag, s) not in hinted:
                    model.AddHint(var, 1)
                    hinted.add((fid, tag, s))

    model = cp_model.CpModel()
    plan: Dict[Tuple[int, str, int], cp_model.IntVar] = {}

    # Decision variables
    for fid in FACH_ID:
        for tag in TAGE:
            for stunde in range(slots_per_day):
                plan[(fid, tag, stunde)] = model.NewBoolVar(f"plan_{fid}_{tag}_{stunde}")

    # Jede Requirement-Beschreibung genau so oft einplanen wie benötigt
    for fid in FACH_ID:
        need = int(df.loc[fid, "Wochenstunden"])
        model.Add(sum(plan[(fid, tag, s)] for tag in TAGE for s in range(slots_per_day)) == need)

    # Klassen, Lehrer, Räume -> keine Doppelbelegung
    for tag in TAGE:
        for stunde in range(slots_per_day):
            # Klassen dürfen nur einmal vorkommen
            for klasse in KLASSEN:
                model.Add(sum(plan[(fid, tag, stunde)] for fid in FACH_ID if df.loc[fid, "Klasse"] == klasse) <= 1)
            # Lehrer dürfen nur einmal vorkommen
            for lehrer in LEHRER:
                model.Add(sum(plan[(fid, tag, stunde)] for fid in FACH_ID if df.loc[fid, "Lehrer"] == lehrer) <= 1)

    # Zusatz-Constraints (Bandfächer, Räume, feste Slots etc.) werden wie gehabt hinzugefügt
    add_constraints(
        model,
        plan,
        df,
        FACH_ID,
        TAGE,
        KLASSEN,
        LEHRER,
        regeln,
        teacher_workdays=teacher_workdays,
        room_plan=room_plan,
        fixed_slots=fixed_slots,
        flexible_groups=flexible_groups,
        flexible_slot_limits=flexible_slot_limits,
        class_windows=class_windows,
        pool_teacher_names=pool_teacher_names,
        slots_per_day=slots_per_day,
        pause_slots=pause_slots,
    )

    if use_value_hints:
        add_value_hints_evenly(model, plan, slots_per_day=slots_per_day, seed=base_seed)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.1, float(time_per_attempt))
    solver.parameters.num_search_workers = 8
    solver.parameters.random_seed = base_seed
    solver.parameters.log_search_progress = True

    def try_solve(seed: int) -> Tuple[int, float]:
        solver.parameters.random_seed = seed
        result = solver.Solve(model)
        score = _compute_score(model, solver)
        solver_logger.debug(
            "solve_best_plan attempt seed=%s status=%s objective=%s score=%.2f",
            seed,
            result,
            solver.ObjectiveValue() if hasattr(solver, "ObjectiveValue") else None,
            score,
        )
        return result, score

    best_status = cp_model.UNKNOWN
    best_score = 0.0
    attempts = max(1, max_attempts if multi_start else 1)
    patience_counter = patience

    for attempt in range(attempts):
        seed = base_seed + attempt * seed_step if multi_start else base_seed
        status, score = try_solve(seed)
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            best_status = status
            best_score = score
            if status == cp_model.OPTIMAL:
                break
            patience_counter -= 1
            if patience_counter <= 0:
                break
        else:
            patience_counter -= 1
            if patience_counter <= 0:
                break

    if best_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        solver_logger.warning(
            "solve_best_plan exhausted attempts without feasible solution | attempts=%s",
            attempts,
        )
    else:
        solver_logger.info("solve_best_plan best status=%s score=%.2f", best_status, best_score)

    return best_status, solver, model, plan, best_score


def _compute_score(model: cp_model.CpModel, solver: cp_model.CpSolver) -> float:
    has_obj = hasattr(model, "HasObjective") and getattr(model, "HasObjective")
    try:
        penalty = solver.ObjectiveValue()
    except Exception:
        penalty = 0.0
    return 1000.0 / (1.0 + max(0.0, penalty))


try:
    from stundenplan_regeln import add_constraints
except ImportError as exc:  # pragma: no cover
    raise RuntimeError("Regel-Engine 'stundenplan_regeln' fehlt im PYTHONPATH") from exc
