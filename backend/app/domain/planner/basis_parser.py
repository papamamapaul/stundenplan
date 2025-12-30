from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

from fastapi import HTTPException
from sqlmodel import Session, select

from ...models import BasisPlan
from ...schemas import SlotMeta
from ...utils import TAGE


@dataclass
class BasisPlanContext:
    room_plan: Dict[int, Dict[str, List[bool]]]
    class_windows_by_name: Dict[str, Dict[str, List[bool]]]
    class_fixed_lookup: Dict[str, Dict[str, set[int]]]
    flexible_slot_lookup: Dict[Tuple[str, str, int], set[int]]
    flexible_slot_limits: Dict[Tuple[str, str, int], set[int]]
    flexible_groups: List[dict]
    fixed_slot_map: Dict[int, List[Tuple[str, int]]]
    slots_per_day: int
    pause_slots: set[int]
    slots_meta: List[SlotMeta]


class BasisPlanParser:
    DAY_KEY_TO_TAG = {
        "mon": "Mo",
        "tue": "Di",
        "wed": "Mi",
        "thu": "Do",
        "fri": "Fr",
    }

    def __init__(self, session: Session) -> None:
        self.session = session

    def parse(
        self,
        account_id: int,
        period_id: int,
        df,
        FACH_ID,
        class_id_to_name: Dict[int, str],
        subject_id_to_name: Dict[int, str],
    ) -> BasisPlanContext:
        basis_payload = self._load_payload(account_id, period_id)
        return self.parse_from_payload(
            basis_payload,
            df,
            FACH_ID,
            class_id_to_name,
            subject_id_to_name,
        )

    def parse_from_payload(
        self,
        payload: Dict[str, object],
        df,
        FACH_ID,
        class_id_to_name: Dict[int, str],
        subject_id_to_name: Dict[int, str],
    ) -> BasisPlanContext:
        """Parse already-loaded JSON payload (useful for previews/tests)."""
        basis_payload = payload or {}

        self._reset_state()
        self.class_id_to_name = class_id_to_name
        self.subject_id_to_name = subject_id_to_name

        self._parse_room_plan(basis_payload)
        self._parse_meta(basis_payload)
        self._parse_class_windows(basis_payload)

        pick_fid = self._build_fid_picker(df, FACH_ID)
        self._parse_fixed_slots(basis_payload, pick_fid)
        self._parse_flexible_groups(basis_payload, pick_fid)

        if self.basis_errors:
            raise HTTPException(status_code=400, detail=" ".join(sorted(self.basis_errors)))

        slots_meta = [SlotMeta(**item) for item in self.slots_meta_payload] if self.slots_meta_payload else []
        if self.fixed_slot_map:
            self.fixed_slot_map = {
                fid: sorted(
                    set(slots),
                    key=lambda item: (TAGE.index(item[0]) if item[0] in TAGE else 0, item[1]),
                )
                for fid, slots in self.fixed_slot_map.items()
            }

        return BasisPlanContext(
            room_plan=self.room_plan,
            class_windows_by_name=self.class_windows_by_name,
            class_fixed_lookup=self.class_fixed_lookup,
            flexible_slot_lookup=self.flexible_slot_lookup,
            flexible_slot_limits=self.flexible_slot_limits,
            flexible_groups=self.flexible_groups,
            fixed_slot_map=self.fixed_slot_map,
            slots_per_day=self.slots_per_day,
            pause_slots=self.pause_slots,
            slots_meta=slots_meta,
        )

    def _reset_state(self) -> None:
        self.room_plan: Dict[int, Dict[str, List[bool]]] = {}
        self.class_windows_by_name: Dict[str, Dict[str, List[bool]]] = {}
        self.class_fixed_lookup: Dict[str, Dict[str, set[int]]] = {}
        self.flexible_slot_lookup: Dict[Tuple[str, str, int], set[int]] = {}
        self.flexible_slot_limits: Dict[Tuple[str, str, int], set[int]] = {}
        self.flexible_groups: List[dict] = []
        self.fixed_slot_map: Dict[int, List[Tuple[str, int]]] = {}
        self.slots_per_day = 8
        self.pause_slots: set[int] = set()
        self.slots_meta_payload: List[dict] = []
        self.basis_errors: Set[str] = set()

    def _load_payload(self, account_id: int, period_id: int) -> Dict[str, object]:
        basis_row = self.session.exec(
            select(BasisPlan).where(
                BasisPlan.account_id == account_id,
                BasisPlan.planning_period_id == period_id,
            )
        ).first()
        if not basis_row:
            legacy_basis = self.session.exec(
                select(BasisPlan).where(
                    BasisPlan.account_id == account_id,
                    BasisPlan.planning_period_id == None,  # noqa: E711
                )
            ).first()
            if legacy_basis:
                legacy_basis.planning_period_id = period_id
                self.session.add(legacy_basis)
                self.session.commit()
                self.session.refresh(legacy_basis)
                basis_row = legacy_basis
        if basis_row and basis_row.data:
            try:
                payload = json.loads(basis_row.data)
            except json.JSONDecodeError:
                payload = {}
            return payload if isinstance(payload, dict) else {}
        return {}

    def _parse_room_plan(self, payload: Dict[str, object]) -> None:
        rooms_cfg = payload.get("rooms") or {}
        room_items = rooms_cfg.items() if isinstance(rooms_cfg, dict) else []
        for key, cfg in room_items:
            if not isinstance(cfg, dict):
                continue
            rid = cfg.get("room_id")
            if rid is None:
                try:
                    rid = int(key)
                except (TypeError, ValueError):
                    continue
            try:
                rid_int = int(rid)
            except (TypeError, ValueError):
                continue
            allowed_cfg = cfg.get("allowed") or {}
            normalized: dict[str, list[bool]] = {}
            for tag in TAGE:
                slots = allowed_cfg.get(tag)
                if not slots:
                    normalized[tag] = [True] * max(1, self.slots_per_day)
                else:
                    normalized[tag] = [
                        bool(slots[i]) if i < len(slots) else True
                        for i in range(self.slots_per_day if self.slots_per_day > 0 else 8)
                    ]
            self.room_plan[rid_int] = normalized

    def _parse_meta(self, payload: Dict[str, object]) -> None:
        meta_cfg = payload.get("meta") if isinstance(payload, dict) else {}
        if isinstance(meta_cfg, dict):
            meta_slots = meta_cfg.get("slots")
            if isinstance(meta_slots, list):
                self.slots_per_day = max(self.slots_per_day, len(meta_slots))
                for idx, slot_entry in enumerate(meta_slots):
                    if isinstance(slot_entry, dict) and slot_entry.get("isPause"):
                        self.pause_slots.add(idx)
                    label = slot_entry.get("label") if isinstance(slot_entry, dict) else None
                    self.slots_meta_payload.append(
                        {
                            "index": idx,
                            "label": label or f"{idx + 1}. Stunde",
                            "start": slot_entry.get("start") if isinstance(slot_entry, dict) else None,
                            "end": slot_entry.get("end") if isinstance(slot_entry, dict) else None,
                            "is_pause": bool(slot_entry.get("isPause")) if isinstance(slot_entry, dict) else False,
                        }
                    )

    def _parse_class_windows(self, payload: Dict[str, object]) -> None:
        classes_cfg = payload.get("classes") or {}
        if isinstance(classes_cfg, dict):
            for class_key, cfg in classes_cfg.items():
                try:
                    class_id_int = int(class_key)
                except (TypeError, ValueError):
                    continue
                allowed_cfg = cfg.get("allowed") or {}
                normalized: dict[str, list[bool]] = {}
                for tag in TAGE:
                    slots = allowed_cfg.get(tag)
                    if not slots:
                        normalized[tag] = [True] * self.slots_per_day if self.slots_per_day > 0 else [True]
                    else:
                        normalized[tag] = []
                        for i, val in enumerate(slots):
                            normalized[tag].append(bool(val))
                            self._register_slot_index(i)
                        if not normalized[tag]:
                            normalized[tag] = [True] * self.slots_per_day
                class_name = self.class_id_to_name.get(class_id_int)
                if class_name:
                    self.class_windows_by_name[class_name] = normalized
                else:
                    self.class_windows_by_name[str(class_id_int)] = normalized

    def _parse_fixed_slots(self, payload: Dict[str, object], pick_fid) -> None:
        fixed_cfg = payload.get("fixed") or {}
        if isinstance(fixed_cfg, dict):
            for class_key, entries in fixed_cfg.items():
                try:
                    class_id_int = int(class_key)
                except (TypeError, ValueError):
                    continue
                class_name = self.class_id_to_name.get(class_id_int) or str(class_id_int)
                if not isinstance(entries, list):
                    continue
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    subject_id = entry.get("subjectId") or entry.get("subject_id")
                    day_key = entry.get("day")
                    slot_index = entry.get("slot")
                    if subject_id is None or day_key not in self.DAY_KEY_TO_TAG or slot_index is None:
                        continue
                    self._register_slot_index(slot_index)
                    subject_name = self.subject_id_to_name.get(int(subject_id))
                    if not subject_name:
                        continue
                    solver_day = self.DAY_KEY_TO_TAG[day_key]
                    try:
                        slot_int = int(slot_index)
                    except (TypeError, ValueError):
                        continue
                    if slot_int < 0 or slot_int >= self.slots_per_day:
                        continue
                    fid = pick_fid((class_name, subject_name))
                    if fid is None:
                        self.basis_errors.add(f"Zu viele feste Slots für {class_name} / {subject_name}.")
                        continue
                    self.fixed_slot_map.setdefault(fid, []).append((solver_day, slot_int))
                    self.class_fixed_lookup.setdefault(class_name, {}).setdefault(solver_day, set()).add(slot_int)

    def _parse_flexible_groups(self, payload: Dict[str, object], pick_fid) -> None:
        flex_cfg = payload.get("flexible") or {}
        if isinstance(flex_cfg, dict):
            for class_key, groups in flex_cfg.items():
                try:
                    class_id_int = int(class_key)
                except (TypeError, ValueError):
                    continue
                class_name = self.class_id_to_name.get(class_id_int) or str(class_id_int)
                if not isinstance(groups, list):
                    continue
                for group in groups:
                    if not isinstance(group, dict):
                        continue
                    subject_id = group.get("subjectId") or group.get("subject_id")
                    if subject_id is None:
                        continue
                    subject_name = self.subject_id_to_name.get(int(subject_id))
                    if not subject_name:
                        continue
                    option_set = set()
                    for slot in group.get("slots") or []:
                        if not isinstance(slot, dict):
                            continue
                        day_key = slot.get("day")
                        solver_day = self.DAY_KEY_TO_TAG.get(day_key or "")
                        if solver_day is None:
                            continue
                        try:
                            slot_int = int(slot.get("slot"))
                        except (TypeError, ValueError):
                            continue
                        self._register_slot_index(slot_int)
                        if slot_int < 0 or slot_int >= self.slots_per_day:
                            continue
                        option_set.add((solver_day, slot_int))
                    if not option_set:
                        continue
                    fid = pick_fid((class_name, subject_name))
                    if fid is None:
                        self.basis_errors.add(f"Zu viele Optionen für {class_name} / {subject_name}.")
                        continue
                    option_payload = {
                        "fid": fid,
                        "slots": sorted(
                            option_set,
                            key=lambda item: (TAGE.index(item[0]) if item[0] in TAGE else 0, item[1]),
                        ),
                    }
                    self.flexible_groups.append(option_payload)
                    for solver_day, slot_int in option_set:
                        self.flexible_slot_lookup.setdefault((class_name, solver_day, slot_int), set()).add(fid)
                        self.flexible_slot_limits.setdefault((class_name, solver_day, slot_int), set()).add(fid)

    def _register_slot_index(self, value: object) -> None:
        try:
            slot_idx = int(value)
        except (TypeError, ValueError):
            return
        if slot_idx >= 0 and slot_idx + 1 > self.slots_per_day:
            self.slots_per_day = slot_idx + 1

    def _build_fid_picker(self, df, FACH_ID):
        fid_hours = {fid: int(df.loc[fid, "Wochenstunden"]) for fid in FACH_ID}
        fid_usage = defaultdict(int)
        class_subject_fids: Dict[Tuple[str, str], List[int]] = defaultdict(list)
        for fid in FACH_ID:
            key = (str(df.loc[fid, "Klasse"]), str(df.loc[fid, "Fach"]))
            class_subject_fids[key].append(fid)

        def pick_fid(key: Tuple[str, str]) -> Optional[int]:
            fids = class_subject_fids.get(key)
            if not fids:
                return None
            for fid in fids:
                if fid_usage[fid] < fid_hours[fid]:
                    fid_usage[fid] += 1
                    return fid
            return None

        return pick_fid
