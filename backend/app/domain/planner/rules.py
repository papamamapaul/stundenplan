from __future__ import annotations

from typing import Dict


def rules_to_dict(rule_profile: Dict[str, int | bool] | None) -> Dict[str, int | bool]:
    if not rule_profile:
        return {}
    return dict(rule_profile)
