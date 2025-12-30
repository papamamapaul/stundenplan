from __future__ import annotations

import pandas as pd
from ortools.sat.python import cp_model

from backend.app.infrastructure.solver.ortools_solver import OrToolsPlannerSolver


def test_pool_teacher_fixed_slots_can_overlap():
    solver = OrToolsPlannerSolver()
    df = pd.DataFrame(
        {
            "Wochenstunden": [1, 1],
            "Klasse": ["1A", "2A"],
            "Lehrer": ["Lehrkräfte-Pool", "Lehrkräfte-Pool"],
            "Fach": ["Förder", "Förder"],
            "Bandfach": [False, False],
            "Participation": ["curriculum", "curriculum"],
        }
    )
    df.index = [0, 1]
    inputs = {
        "df": df,
        "FACH_ID": [0, 1],
        "KLASSEN": ["1A", "2A"],
        "LEHRER": ["Lehrkräfte-Pool"],
        "regeln": {"basisplan_fixed": True},
        "teacher_workdays": {},
        "pool_teacher_names": {"Lehrkräfte-Pool"},
        "room_plan": {},
        "fixed_slots": {
            0: [("Mo", 0)],
            1: [("Mo", 0)],
        },
        "flexible_groups": [],
        "flexible_slot_limits": {},
        "class_windows": {},
        "pause_slots": set(),
        "slots_per_day": 1,
        "multi_start": False,
        "max_attempts": 1,
        "patience": 1,
        "time_per_attempt": 1.0,
        "randomize_search": False,
        "base_seed": 42,
        "seed_step": 1,
        "use_value_hints": False,
    }

    result = solver.solve(inputs)

    assert result["status"] in (cp_model.OPTIMAL, cp_model.FEASIBLE)
