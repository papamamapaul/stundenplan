from __future__ import annotations

from typing import Dict, List, Optional, Tuple, Set
import logging

import pandas as pd
from ortools.sat.python import cp_model

from ...utils import TAGE
from ...domain.planner.solver_protocol import PlannerSolver, SolverInputs, SolverOutputs

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


class OrToolsPlannerSolver(PlannerSolver):
    def solve(self, inputs: SolverInputs) -> SolverOutputs:
        df: pd.DataFrame = inputs['df']
        FACH_ID = inputs['FACH_ID']
        KLASSEN = inputs['KLASSEN']
        LEHRER = inputs['LEHRER']
        regeln = inputs['regeln']
        pool_teacher_names = {
            str(name).strip().lower()
            for name in (inputs.get('pool_teacher_names') or [])
            if str(name).strip()
        }

        slots_per_day = max(1, int(inputs.get('slots_per_day', 8)))

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

        for fid in FACH_ID:
            for tag in TAGE:
                for stunde in range(slots_per_day):
                    plan[(fid, tag, stunde)] = model.NewBoolVar(f"plan_{fid}_{tag}_{stunde}")

        for fid in FACH_ID:
            need = int(df.loc[fid, "Wochenstunden"])
            model.Add(sum(plan[(fid, tag, s)] for tag in TAGE for s in range(slots_per_day)) == need)

        for tag in TAGE:
            for stunde in range(slots_per_day):
                for klasse in KLASSEN:
                    model.Add(sum(plan[(fid, tag, stunde)] for fid in FACH_ID if df.loc[fid, "Klasse"] == klasse) <= 1)
                for lehrer in LEHRER:
                    normalized = str(lehrer).strip().lower()
                    if normalized in pool_teacher_names:
                        continue
                    model.Add(
                        sum(
                            plan[(fid, tag, stunde)]
                            for fid in FACH_ID
                            if df.loc[fid, "Lehrer"] == lehrer
                        )
                        <= 1
                    )

        add_constraints(
            model,
            plan,
            df,
            FACH_ID,
            TAGE,
            KLASSEN,
            LEHRER,
            regeln,
            teacher_workdays=inputs.get('teacher_workdays'),
            room_plan=inputs.get('room_plan'),
            fixed_slots=inputs.get('fixed_slots'),
            flexible_groups=inputs.get('flexible_groups'),
            flexible_slot_limits=inputs.get('flexible_slot_limits'),
            class_windows=inputs.get('class_windows'),
            pool_teacher_names=inputs.get('pool_teacher_names'),
            slots_per_day=slots_per_day,
            pause_slots=inputs.get('pause_slots'),
        )

        if inputs.get('use_value_hints', True):
            add_value_hints_evenly(
                model,
                plan,
                slots_per_day=slots_per_day,
                seed=inputs.get('base_seed', 42),
            )

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max(0.1, float(inputs.get('time_per_attempt', 5.0)))
        solver.parameters.num_search_workers = 8
        solver.parameters.log_search_progress = True

        multi_start = inputs.get('multi_start', True)
        attempts = max(1, inputs.get('max_attempts', 10) if multi_start else 1)
        patience = inputs.get('patience', 3)
        base_seed = inputs.get('base_seed', 42)
        seed_step = inputs.get('seed_step', 17)

        best_status = cp_model.UNKNOWN
        best_score = 0.0
        patience_counter = patience

        for attempt in range(attempts):
            seed = base_seed + attempt * seed_step if multi_start else base_seed
            solver.parameters.random_seed = seed
            status = solver.Solve(model)
            score = _compute_score(model, solver)
            solver_logger.debug(
                "solve_best_plan attempt seed=%s status=%s objective=%s score=%.2f",
                seed,
                status,
                solver.ObjectiveValue() if hasattr(solver, "ObjectiveValue") else None,
                score,
            )
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
            solver_logger.warning("solve_best_plan exhausted attempts without feasible solution")

        return SolverOutputs(status=best_status, solver=solver, model=model, plan=plan, score=best_score)


def _compute_score(model: cp_model.CpModel, solver: cp_model.CpSolver) -> float:
    try:
        penalty = solver.ObjectiveValue()
    except Exception:
        penalty = 0.0
    return 1000.0 / (1.0 + max(0.0, penalty))
