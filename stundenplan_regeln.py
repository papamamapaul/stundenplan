# stundenplan_regeln.py
import math

from ortools.sat.python import cp_model


def add_constraints(
    model,
    plan,
    df,
    FACH_ID,
    TAGE,
    KLASSEN,
    LEHRER,
    regeln,
    teacher_workdays=None,
    room_plan=None,
    fixed_slots=None,
    flexible_groups=None,
    flexible_slot_limits=None,
    class_windows=None,
    pool_teacher_names=None,
    slots_per_day=8,
    pause_slots=None,
):
    """
    Baut alle Constraints und (falls aktiv) Soft-Objectives auf.

    Erwartete Spalten in df:
      - 'Fach', 'Klasse', 'Lehrer', 'Wochenstunden'
      - optional: 'Doppelstunde' in {'muss','kann','nein'}
      - optional: 'Nachmittag'   in {'muss','kann','nein'}
      - optional: 'TeacherId'

    regeln (Dict, via UI):
      - stundenbedarf_vollstaendig (bool)
      - keine_lehrerkonflikte (bool)
      - keine_klassenkonflikte (bool)
      - raum_verfuegbarkeit (bool)
      - basisplan_fixed (bool)
      - basisplan_flexible (bool)
      - basisplan_windows (bool)
      - stundenbegrenzung (bool)
      - stundenbegrenzung_erste_stunde (bool)
      - keine_hohlstunden (bool)            -> Soft (empfohlen)
      - keine_hohlstunden_hard (bool)       -> Hard (optional)
      - fach_nachmittag_regeln (bool)        -> nutzt Requirement 'Nachmittag'
      - nachmittag_pause_stunde (bool)
      - doppelstundenregel (bool)
      - einzelstunde_nur_rand (bool)
      - bandstunden_parallel (bool)         # Alias leseband_parallel
      - gleichverteilung (bool)
      - lehrer_hohlstunden_soft (bool)      -> Soft-Penalty für Lehrkräfte-Lücken
      - lehrer_arbeitstage (bool)           -> respektiert Lehrer-Arbeitstage
      - mittagsschule_vormittag (bool)       -> 4/≥5-Logik je Tag/Klasse

    Zusätzlich (NEU): Gewichte für Soft-Objectives – kommen aus regeln, haben Defaults:
      - W_GAPS_START, W_GAPS_INSIDE, W_EVEN_DIST, W_EINZEL_KANN, W_EINZEL_SOLL
      - TEACHER_GAPS_DAY_MAX, TEACHER_GAPS_WEEK_MAX, W_TEACHER_GAPS
    """

    def _str_val(row, col, default=""):
        if col not in df.columns:
            return default
        return str(row[col]).strip().lower()

    # -------- Soft-Objective Gewichte (anpassbar via regeln) --------
    W_GAPS_START  = int(regeln.get("W_GAPS_START", 2))     # Lücke direkt zu Beginn
    W_GAPS_INSIDE = int(regeln.get("W_GAPS_INSIDE", 3))    # 0->1 Übergang innerhalb des Tages (Hohlstunde)
    W_EVEN_DIST   = int(regeln.get("W_EVEN_DIST", 1))      # Gleichmäßige Verteilung über die Woche
    W_EINZEL_KANN = int(regeln.get("W_EINZEL_KANN", 5))    # Einzelstunden-Penalty, wenn Doppelstunde "kann"
    W_EINZEL_SOLL = int(regeln.get("W_EINZEL_SOLL", 8))    # Fehlende Doppelstunden, wenn Doppelstunde "soll"
    W_BAND_OPTIONAL = int(regeln.get("W_BAND_OPTIONAL", 6))  # Optionales Bandfach nicht eingeplant

    obj_terms = []

    fid_participation: dict[int, str] = {}
    fid_canonical_subject: dict[int, tuple[int | None, str]] = {}
    class_fids: dict[str, list[int]] = {}
    for fid in FACH_ID:
        participation = str(df.loc[fid].get('Participation') or 'curriculum').lower()
        fid_participation[fid] = participation
        canonical_id = df.loc[fid].get('CanonicalSubjectId')
        canonical_name = df.loc[fid].get('CanonicalSubject') or df.loc[fid]['Fach']
        try:
            canonical_id = int(canonical_id)
        except (TypeError, ValueError):
            canonical_id = None
        fid_canonical_subject[fid] = (canonical_id, str(canonical_name))
        klasse_key = str(df.loc[fid, 'Klasse'])
        class_fids.setdefault(klasse_key, []).append(fid)

    enforce_hours = bool(regeln.get("stundenbedarf_vollstaendig", True))
    enforce_teacher_conflicts = bool(regeln.get("keine_lehrerkonflikte", True))
    enforce_teacher_workdays = bool(regeln.get("lehrer_arbeitstage", True))
    allow_band_teacher_parallel = bool(regeln.get("band_lehrer_parallel", True))
    enforce_class_conflicts = bool(regeln.get("keine_klassenkonflikte", True))
    enforce_room_windows = bool(regeln.get("raum_verfuegbarkeit", True))
    enforce_fixed_slots = bool(regeln.get("basisplan_fixed", True))
    enforce_flexible_slots = bool(regeln.get("basisplan_flexible", True))
    enforce_class_windows = bool(regeln.get("basisplan_windows", True))
    enforce_day_limits = bool(regeln.get("stundenbegrenzung", True))
    enforce_first_slot = bool(regeln.get("stundenbegrenzung_erste_stunde", True))
    enforce_subject_afternoon = bool(regeln.get("fach_nachmittag_regeln", True))
    enforce_afternoon_break = bool(regeln.get("nachmittag_pause_stunde", False))
    enforce_midday_rule = bool(regeln.get("mittagsschule_vormittag", True))
    enforce_band_parallel = bool(regeln.get("bandstunden_parallel", regeln.get("leseband_parallel", True)))
    enforce_teacher_gaps_soft = bool(regeln.get("lehrer_hohlstunden_soft", True))

    teacher_gaps_day_max = max(0, int(regeln.get("TEACHER_GAPS_DAY_MAX", 1)))
    teacher_gaps_week_max = max(0, int(regeln.get("TEACHER_GAPS_WEEK_MAX", 3)))
    W_TEACHER_GAPS = int(regeln.get("W_TEACHER_GAPS", 2))

    teacher_workdays = teacher_workdays or {}
    slots_per_day = max(1, int(slots_per_day))
    slots_range = range(slots_per_day)
    pool_teacher_names_norm = {
        str(name).strip().lower()
        for name in (pool_teacher_names or [])
        if str(name).strip()
    }
    pause_slots = {int(idx) for idx in (pause_slots or []) if int(idx) >= 0}
    teaching_slots = [idx for idx in range(slots_per_day) if idx not in pause_slots]

    # -------- 1) Jede Fachstunde MUSS platziert werden --------
    for fid in FACH_ID:
        anzahl = int(df.loc[fid, 'Wochenstunden'])
        participation = fid_participation.get(fid, 'curriculum')
        total = sum(plan[(fid, tag, std)] for tag in TAGE for std in slots_range)
        if participation == 'ag' or not enforce_hours:
            model.Add(total <= anzahl)
        else:
            model.Add(total == anzahl)

    # -------- 2) Keine Überlagerung (Lehrer/Klasse nie doppelt in einer Stunde) --------
    if enforce_teacher_conflicts or enforce_class_conflicts:
        for tag in TAGE:
            for std in slots_range:
                if std in pause_slots:
                    for fid in FACH_ID:
                        key = (fid, tag, std)
                        if key in plan:
                            model.Add(plan[key] == 0)
                    continue
                if enforce_teacher_conflicts:
                    for lehrer in LEHRER:
                        normalized_teacher_name = str(lehrer).strip().lower()
                        if normalized_teacher_name in pool_teacher_names_norm:
                            continue
                        belegte = [plan[(fid, tag, std)] for fid in FACH_ID if df.loc[fid, 'Lehrer'] == lehrer]
                        if not belegte:
                            continue
                        if not allow_band_teacher_parallel:
                            model.Add(sum(belegte) <= 1)
                            continue

                        band_groups: dict[int, list] = {}
                        non_band_vars = []
                        for fid in FACH_ID:
                            if df.loc[fid, 'Lehrer'] != lehrer:
                                continue
                            var = plan[(fid, tag, std)]
                            is_band = bool(df.loc[fid].get('Bandfach'))
                            if is_band:
                                canonical_id, _ = fid_canonical_subject.get(fid, (None, str(df.loc[fid, 'Fach'])))
                                if canonical_id is None:
                                    non_band_vars.append(var)
                                else:
                                    band_groups.setdefault(canonical_id, []).append(var)
                            else:
                                non_band_vars.append(var)

                        indicators = []

                        if non_band_vars:
                            model.Add(sum(non_band_vars) <= 1)
                            nb = model.NewBoolVar(f"teacher_{lehrer}_{tag}_{std}_nonband")
                            if len(non_band_vars) == 1:
                                model.Add(non_band_vars[0] == nb)
                            else:
                                model.Add(sum(non_band_vars) >= nb)
                                model.Add(sum(non_band_vars) <= len(non_band_vars) * nb)
                            indicators.append(nb)

                        for canonical_id, vars_list in band_groups.items():
                            if not vars_list:
                                continue
                            indicator = model.NewBoolVar(f"teacher_{lehrer}_{tag}_{std}_band_{canonical_id}")
                            model.Add(sum(vars_list) >= indicator)
                            model.Add(sum(vars_list) <= len(vars_list) * indicator)
                            indicators.append(indicator)
                            if non_band_vars:
                                upper = len(non_band_vars)
                                model.Add(sum(non_band_vars) + upper * indicator <= upper)

                        if indicators:
                            model.Add(sum(indicators) <= 1)
                if enforce_class_conflicts:
                    for klasse in KLASSEN:
                        belegte = [plan[(fid, tag, std)] for fid in FACH_ID if str(df.loc[fid, 'Klasse']) == str(klasse)]
                        if belegte:
                            model.Add(sum(belegte) <= 1)

    if enforce_teacher_workdays:
        for fid in FACH_ID:
            teacher_value = df.loc[fid].get('TeacherId')
            if teacher_value is None:
                continue
            if isinstance(teacher_value, float) and math.isnan(teacher_value):
                continue
            try:
                teacher_id = int(teacher_value)
            except (TypeError, ValueError):
                continue
            workdays = teacher_workdays.get(teacher_id)
            if not workdays:
                continue
            for tag in TAGE:
                if bool(workdays.get(tag, True)):
                    continue
                for std in slots_range:
                    key = (fid, tag, std)
                    if key in plan:
                        model.Add(plan[key] == 0)

    # -------- 2b) Räume: Verfügbarkeiten (keine Exklusivität, Basisplan steuert Slots) --------
    room_assignments = {}
    if "RoomID" in df.columns:
        def _normalize_room_id(value):
            if value is None:
                return None
            if isinstance(value, (int,)):
                return int(value)
            if isinstance(value, float):
                if math.isnan(value):
                    return None
                return int(value)
            try:
                return int(str(value))
            except (TypeError, ValueError):
                return None

        for fid in FACH_ID:
            rid = _normalize_room_id(df.loc[fid, "RoomID"])
            if rid is not None:
                room_assignments[fid] = rid

    def _room_slot_allowed(rid, tag, std):
        if not room_plan:
            return True
        cfg = room_plan.get(rid)
        if not cfg:
            return True
        slots = cfg.get(tag)
        if not slots:
            return True
        if std >= len(slots):
            return True
        return bool(slots[std])

    if room_assignments and enforce_room_windows:
        for fid, rid in room_assignments.items():
            for tag in TAGE:
                for std in slots_range:
                    if std in pause_slots:
                        model.Add(plan[(fid, tag, std)] == 0)
                        continue
                    if not _room_slot_allowed(rid, tag, std):
                        model.Add(plan[(fid, tag, std)] == 0)

    if class_windows and enforce_class_windows:
        for fid in FACH_ID:
            klasse_name = str(df.loc[fid, 'Klasse'])
            day_map = class_windows.get(klasse_name)
            if not day_map:
                continue
            for tag in TAGE:
                slots_allowed = day_map.get(tag)
                if not slots_allowed:
                    continue
                for std in range(min(len(slots_allowed), slots_per_day)):
                    if not bool(slots_allowed[std]):
                        model.Add(plan[(fid, tag, std)] == 0)

    # -------- 3) Tagesbegrenzung (Mo–Do max. 6, Fr max. 5) --------
    if enforce_day_limits:
        for tag in ['Mo', 'Di', 'Mi', 'Do']:
            for klasse in KLASSEN:
                tagstunden = [
                    plan[(fid, tag, std)]
                    for fid in FACH_ID for std in slots_range
                    if str(df.loc[fid, 'Klasse']) == str(klasse)
                ]
                if tagstunden:
                    model.Add(sum(tagstunden) <= 6)
        for klasse in KLASSEN:
            tagstunden = [
                plan[(fid, 'Fr', std)]
                for fid in FACH_ID for std in slots_range
                if str(df.loc[fid, 'Klasse']) == str(klasse)
            ]
            if tagstunden:
                model.Add(sum(tagstunden) <= 5)

    # 3b) Wenn Tageslimit erreicht (6/5), MUSS Stunde 1 belegt sein (sonst optional)
        if enforce_first_slot:
            for tag in TAGE:
                max_tag = min(6 if tag != 'Fr' else 5, slots_per_day)
                for klasse in KLASSEN:
                    belegte_stunden = [plan[(fid, tag, std)]
                                       for fid in FACH_ID for std in range(max_tag)
                                       if str(df.loc[fid, 'Klasse']) == str(klasse)]
                    must_first = model.NewBoolVar(f"{klasse}_{tag}_muss_erste")
                    model.Add(sum(belegte_stunden) == max_tag).OnlyEnforceIf(must_first)
                    model.Add(sum(belegte_stunden) != max_tag).OnlyEnforceIf(must_first.Not())

                    first_slot = [plan[(fid, tag, 0)]
                                  for fid in FACH_ID
                                  if str(df.loc[fid, 'Klasse']) == str(klasse)]
                    if first_slot:
                        model.Add(sum(first_slot) == 1).OnlyEnforceIf(must_first)

    # -------- 4) Hohlstunden: Soft- oder Hard-Variante --------
    def _occ_vars_for_klasse_tag(klasse, tag, slot_indices):
        occ = [model.NewBoolVar(f"occ_{klasse}_{tag}_{pos}") for pos in range(len(slot_indices))]
        for pos, actual in enumerate(slot_indices):
            slots = [plan[(fid, tag, actual)]
                     for fid in FACH_ID
                     if str(df.loc[fid, 'Klasse']) == str(klasse)]
            if slots:
                model.Add(sum(slots) >= occ[pos])
                model.Add(sum(slots) <= len(slots) * occ[pos])
            else:
                model.Add(occ[pos] == 0)
        return occ

    def _add_no_gap_soft(occ, weight_start=W_GAPS_START, weight_gaps=W_GAPS_INSIDE):
        terms = []
        terms.append(weight_start * (1 - occ[0]))  # freie erste Stunde kostet
        for s in range(len(occ) - 1):
            t01 = model.NewBoolVar(f"t01_{id(occ)}_{s}")
            model.AddImplication(t01, occ[s].Not())
            model.AddImplication(t01, occ[s+1])
            model.Add(occ[s+1] - occ[s] <= t01)
            model.Add(occ[s+1] - occ[s] >= t01 - 1)
            terms.append(weight_gaps * t01)
        return terms

    def _add_no_gap_hard(klasse, tag, slot_indices):
        occ = _occ_vars_for_klasse_tag(klasse, tag, slot_indices)
        any_day = model.NewBoolVar(f"any_{klasse}_{tag}")
        model.Add(sum(occ) >= 1).OnlyEnforceIf(any_day)
        model.Add(sum(occ) == 0).OnlyEnforceIf(any_day.Not())

        max_slots = len(slot_indices)
        first = model.NewIntVar(0, max_slots - 1, f"first_{klasse}_{tag}")
        last  = model.NewIntVar(0, max_slots - 1, f"last_{klasse}_{tag}")
        M = 1000
        model.AddMinEquality(first, [s + (1 - occ[s]) * M for s in range(max_slots)]).OnlyEnforceIf(any_day)
        model.AddMaxEquality(last,  [s * occ[s]                 for s in range(max_slots)]).OnlyEnforceIf(any_day)
        model.Add(first == 0).OnlyEnforceIf(any_day.Not())
        model.Add(last  == 0).OnlyEnforceIf(any_day.Not())

        for s in range(max_slots):
            before = model.NewBoolVar(f"before_{klasse}_{tag}_{s}")
            after  = model.NewBoolVar(f"after_{klasse}_{tag}_{s}")
            model.Add(first >= s + 1).OnlyEnforceIf(before)
            model.Add(first <= s).OnlyEnforceIf(before.Not())
            model.Add(last <= s - 1).OnlyEnforceIf(after)
            model.Add(last >= s).OnlyEnforceIf(after.Not())
            inside = model.NewBoolVar(f"inside_{klasse}_{tag}_{s}")
            model.AddBoolAnd([before.Not(), after.Not()]).OnlyEnforceIf(inside)
            model.Add(occ[s] == 0).OnlyEnforceIf([any_day, before])
            model.Add(occ[s] == 0).OnlyEnforceIf([any_day, after])
            model.Add(occ[s] == 1).OnlyEnforceIf([any_day, inside])

    teaching_slots_list = teaching_slots if teaching_slots else list(range(slots_per_day))
    if regeln.get("keine_hohlstunden_hard", False):
        for klasse in KLASSEN:
            for tag in TAGE:
                _add_no_gap_hard(klasse, tag, teaching_slots_list)
    elif regeln.get("keine_hohlstunden", True):
        for klasse in KLASSEN:
            for tag in TAGE:
                occ = _occ_vars_for_klasse_tag(klasse, tag, teaching_slots_list)
                obj_terms += _add_no_gap_soft(occ)

    # -------- 6b) Lehrer-Hohlstunden (Soft) --------
    if enforce_teacher_gaps_soft and W_TEACHER_GAPS > 0:
        teacher_index = {name: idx for idx, name in enumerate(LEHRER)}
        max_possible_day_gaps = max(0, slots_per_day - 1)
        max_day_gaps = min(max_possible_day_gaps, max(0, teacher_gaps_day_max))
        max_possible_week_gaps = len(TAGE) * max_possible_day_gaps
        max_week_gaps = min(max_possible_week_gaps, max(0, teacher_gaps_week_max))

        for lehrer in LEHRER:
            idx = teacher_index[lehrer]
            week_gap_vars = []
            for tag in TAGE:
                occ = []
                for std in slots_range:
                    occ_var = model.NewBoolVar(f"tocc_{idx}_{tag}_{std}")
                    slots = [plan[(fid, tag, std)] for fid in FACH_ID if df.loc[fid, 'Lehrer'] == lehrer]
                    if slots:
                        model.Add(sum(slots) >= occ_var)
                        model.Add(sum(slots) <= len(slots) * occ_var)
                    else:
                        model.Add(occ_var == 0)
                    occ.append(occ_var)

                segment_starts = []
                for std in slots_range:
                    start_var = model.NewBoolVar(f"tseg_{idx}_{tag}_{std}")
                    model.Add(start_var <= occ[std])
                    if std == 0:
                        model.Add(start_var == occ[std])
                    else:
                        model.Add(start_var <= 1 - occ[std - 1])
                        model.Add(start_var >= occ[std] - occ[std - 1])
                    segment_starts.append(start_var)

                segments = model.NewIntVar(0, slots_per_day, f"tsegcount_{idx}_{tag}")
                model.Add(segments == sum(segment_starts))

                total_occ = model.NewIntVar(0, slots_per_day, f"tocc_total_{idx}_{tag}")
                model.Add(total_occ == sum(occ))

                has_teaching = model.NewBoolVar(f"tteach_{idx}_{tag}")
                model.Add(total_occ >= 1).OnlyEnforceIf(has_teaching)
                model.Add(total_occ == 0).OnlyEnforceIf(has_teaching.Not())

                gaps_var = model.NewIntVar(0, max_possible_day_gaps, f"tgaps_{idx}_{tag}")
                model.Add(gaps_var == 0).OnlyEnforceIf(has_teaching.Not())
                model.Add(segments == 0).OnlyEnforceIf(has_teaching.Not())
                model.Add(gaps_var + 1 == segments).OnlyEnforceIf(has_teaching)
                model.Add(segments >= 1).OnlyEnforceIf(has_teaching)

                week_gap_vars.append(gaps_var)

                excess_day = model.NewIntVar(0, max_possible_day_gaps, f"tgap_excess_day_{idx}_{tag}")
                model.Add(excess_day >= gaps_var - max_day_gaps)
                model.Add(excess_day >= 0)
                model.Add(excess_day <= gaps_var)
                obj_terms.append(W_TEACHER_GAPS * excess_day)

            if week_gap_vars:
                week_total = model.NewIntVar(0, max_possible_week_gaps, f"tgap_week_total_{idx}")
                model.Add(week_total == sum(week_gap_vars))
                excess_week = model.NewIntVar(0, max_possible_week_gaps, f"tgap_excess_week_{idx}")
                model.Add(excess_week >= week_total - max_week_gaps)
                model.Add(excess_week >= 0)
                model.Add(excess_week <= week_total)
                obj_terms.append(W_TEACHER_GAPS * excess_week)

    # -------- 6) Doppelstunden 'muss/kann/nein' inkl. max. 2 in Folge --------
    if regeln.get("doppelstundenregel", True):
        for fid in FACH_ID:
            anzahl_stunden = int(df.loc[fid, "Wochenstunden"])
            ds_rule = _str_val(df.loc[fid], "Doppelstunde", default="kann")
            participation = fid_participation.get(fid, 'curriculum')
            canonical_id, canonical_name = fid_canonical_subject.get(fid, (None, str(df.loc[fid, 'Fach'])))

            pair_vars = []    # 2er-Blöcke
            single_vars = []  # Einzelstunden

            for tag in TAGE:
                stunden = [plan[(fid, tag, s)] for s in slots_range]
                # Nie 3 am Stück
                max_triple = max(0, slots_per_day - 2)
                for i in range(max_triple):
                    model.AddBoolOr([stunden[i].Not(), stunden[i+1].Not(), stunden[i+2].Not()])

                # Paare
                max_pair_start = max(0, slots_per_day - 1)
                for s in range(max_pair_start):
                    pair = model.NewBoolVar(f"pair_{fid}_{tag}_{s}")
                    model.Add(pair <= stunden[s])
                    model.Add(pair <= stunden[s+1])
                    model.Add(pair >= stunden[s] + stunden[s+1] - 1)
                    pair_vars.append(pair)

                # Singles
                for s in slots_range:
                    single = model.NewBoolVar(f"single_{fid}_{tag}_{s}")
                    model.AddImplication(single, stunden[s])
                    if s > 0:
                        model.AddBoolOr([single.Not(), stunden[s-1].Not()])
                    if s < slots_per_day - 1:
                        model.AddBoolOr([single.Not(), stunden[s+1].Not()])
                    single_vars.append(single)

            # Zählgleichung
            if participation == 'ag':
                model.Add(2 * sum(pair_vars) + sum(single_vars) <= anzahl_stunden)
            else:
                model.Add(2 * sum(pair_vars) + sum(single_vars) == anzahl_stunden)

            if ds_rule == "muss":
                n_einzel = anzahl_stunden % 2
                model.Add(sum(single_vars) == n_einzel)
                if regeln.get("einzelstunde_nur_rand", True) and n_einzel == 1:
                    # Mittige Singles verbieten
                    idx = 0
                    for tag in TAGE:
                        for s in slots_range:
                            if 0 < s < slots_per_day - 1:
                                model.Add(single_vars[idx] == 0)
                            idx += 1

                for tag in TAGE:
                    stunden = [plan[(fid, tag, s)] for s in slots_range]
                    max_chain = max(0, slots_per_day - 2)
                    for s in range(max_chain):
                        model.Add(stunden[s] + stunden[s+2] <= stunden[s+1] + 1)

            elif ds_rule == "nein":
                for v in pair_vars:
                    model.Add(v == 0)

            elif ds_rule == "kann":
                if pair_vars:
                    max_pairs = anzahl_stunden // 2
                    model.Add(sum(pair_vars) <= max_pairs)

                # Einzelstunden bevorzugen (Soft)
                if W_EINZEL_KANN > 0:
                    single_total = sum(single_vars)
                    pair_total = sum(pair_vars)
                    obj_terms.append(W_EINZEL_KANN * (pair_total * 2 - single_total))

            elif ds_rule == "soll":
                max_pairs = anzahl_stunden // 2
                if pair_vars and max_pairs > 0:
                    missing_pairs = model.NewIntVar(0, max_pairs, f"dsmiss_{fid}")
                    model.Add(missing_pairs >= max_pairs - sum(pair_vars))
                    model.Add(missing_pairs >= 0)
                    model.Add(missing_pairs <= max_pairs)
                    if W_EINZEL_SOLL > 0:
                        obj_terms.append(W_EINZEL_SOLL * missing_pairs)

                if W_EINZEL_SOLL > 0:
                    allowed_single = anzahl_stunden % 2
                    max_single = len(single_vars)
                    extra_single = model.NewIntVar(0, max_single, f"dsextra_{fid}")
                    model.Add(extra_single >= sum(single_vars) - allowed_single)
                    model.Add(extra_single >= 0)
                    model.Add(extra_single <= max_single)
                    obj_terms.append(W_EINZEL_SOLL * extra_single)

        # Begrenze Alias-Fächer (z.B. Deutsch + Leseband) auf max. 2 Slots pro Tag
        canonical_map: dict[tuple[str, str], list[int]] = {}
        for fid in FACH_ID:
            canonical_id, canonical_name = fid_canonical_subject.get(fid, (None, str(df.loc[fid, 'Fach'])))
            klasse = str(df.loc[fid, 'Klasse'])
            key: tuple[str, str] | None = None
            if canonical_id is not None:
                key = (klasse, f"id:{canonical_id}")
            elif canonical_name:
                key = (klasse, f"name:{canonical_name.strip().lower()}")
            if key is None:
                continue
            canonical_map.setdefault(key, []).append(fid)

        for (klasse, _canon), fid_list in canonical_map.items():
            if len(fid_list) <= 1:
                continue
            for tag in TAGE:
                total = sum(plan[(fid, tag, std)] for fid in fid_list for std in slots_range)
                model.Add(total <= 2)

    # -------- 7) Nachmittag je Fach ('muss/kann/nein') --------
    if 'Nachmittag' in df.columns and enforce_subject_afternoon:
        morning_indices = [idx for idx in teaching_slots if idx < 6]
        afternoon_indices = [idx for idx in teaching_slots if idx >= 6]
        for fid in FACH_ID:
            nm_rule = _str_val(df.loc[fid], "Nachmittag", default="kann")
            if nm_rule == "muss":
                anzahl = int(df.loc[fid, "Wochenstunden"])
                if morning_indices:
                    for tag in TAGE:
                        for std in morning_indices:
                            key = (fid, tag, std)
                            if key in plan:
                                model.Add(plan[key] == 0)
                if afternoon_indices:
                    total_afternoon = []
                    for tag in TAGE:
                        for std in afternoon_indices:
                            key = (fid, tag, std)
                            if key in plan:
                                total_afternoon.append(plan[key])
                    if total_afternoon:
                        model.Add(sum(total_afternoon) == anzahl)
            elif nm_rule == "nein":
                for tag in TAGE:
                    for std in afternoon_indices:
                        key = (fid, tag, std)
                        if key in plan:
                            model.Add(plan[key] == 0)
            # 'kann' -> keine Extra-Einschränkung (global gilt ggf. 4) )

    # -------- 8) Vormittagsminimum je Klasse/Tag (mind. 4 Stunden) --------
    if enforce_midday_rule:
        vormittag_indices = teaching_slots[:min(6, len(teaching_slots))]
        for klasse in KLASSEN:
            for tag in TAGE:
                vormittag = [plan[(fid, tag, s)]
                             for fid in FACH_ID for s in vormittag_indices
                             if str(df.loc[fid, 'Klasse']) == str(klasse)]
                if vormittag:
                    model.Add(sum(vormittag) >= 4)

    # -------- 9) Freie 6. Stunde, wenn Nachmittag stattfindet --------
    if enforce_afternoon_break:
        if len(teaching_slots) >= 6:
            sixth_slot_index = teaching_slots[5]
            afternoon_indices = [idx for idx in teaching_slots if idx > sixth_slot_index]
        else:
            sixth_slot_index = None
            afternoon_indices = []
        if afternoon_indices and sixth_slot_index is not None:
            for klasse in KLASSEN:
                for tag in TAGE:
                    nachmittag = [plan[(fid, tag, s)]
                                  for fid in FACH_ID for s in afternoon_indices
                                  if str(df.loc[fid, 'Klasse']) == str(klasse)]
                    if not nachmittag:
                        continue
                    sechste = [plan[(fid, tag, sixth_slot_index)]
                               for fid in FACH_ID
                               if str(df.loc[fid, 'Klasse']) == str(klasse)]
                    if not sechste:
                        continue
                    hat_nachmittag = model.NewBoolVar(f"nachmittag_{klasse}_{tag}")
                    model.Add(sum(nachmittag) >= 1).OnlyEnforceIf(hat_nachmittag)
                    model.Add(sum(nachmittag) == 0).OnlyEnforceIf(hat_nachmittag.Not())
                    model.Add(sum(sechste) == 0).OnlyEnforceIf(hat_nachmittag)

    # -------- 10) Basisplan-Overrides (fix & flexibel) --------
    if enforce_fixed_slots:
        fixed_slots = fixed_slots or {}
        for fid, slots in (fixed_slots.items() if isinstance(fixed_slots, dict) else []):
            for tag, std in slots:
                if (fid, tag, std) in plan:
                    model.Add(plan[(fid, tag, std)] == 1)

    if enforce_flexible_slots:
        flexible_groups = flexible_groups or []
        fid_allowed_slots: dict[int, set[tuple[str, int]]] = {}
        for entry in flexible_groups:
            if not isinstance(entry, dict):
                continue
            fid = entry.get("fid")
            slots = entry.get("slots")
            if fid is None or not isinstance(slots, list):
                continue
            allowed = fid_allowed_slots.setdefault(int(fid), set())
            for tag, std in slots:
                key = (fid, tag, std)
                if key in plan:
                    allowed.add((tag, std))
        for fid, allowed in fid_allowed_slots.items():
            for tag in TAGE:
                for std in slots_range:
                    if std in pause_slots:
                        key = (fid, tag, std)
                        if key in plan:
                            model.Add(plan[key] == 0)
                        continue
                    key = (fid, tag, std)
                    if key not in plan:
                        continue
                    if (tag, std) not in allowed:
                        model.Add(plan[key] == 0)
        # If a requirement was marked as flexible but without a slot list,
        # we simply fall back to the global placement rules.

    # -------- 11) Bandfächer parallel (gleiche Slots je Fach) --------
    if enforce_band_parallel and "Bandfach" in df.columns:
        band_subjects: dict[str, dict[str, object]] = {}
        mismatched_hours: list[str] = []
        for fid in FACH_ID:
            if bool(df.loc[fid].get("Bandfach")):
                name = str(df.loc[fid, "Fach"]).strip()
                entry = band_subjects.setdefault(name, {"mandatory": [], "optional": [], "optional_classes": set()})
                if fid_participation.get(fid, 'curriculum') == 'ag':
                    entry["optional"].append(fid)
                    entry["optional_classes"].add(str(df.loc[fid, 'Klasse']))
                else:
                    entry["mandatory"].append(fid)

        for subject_name, info in band_subjects.items():
            mandatory_fids = info.get("mandatory", [])
            optional_fids = info.get("optional", [])
            optional_classes = info.get("optional_classes", set())
            if not mandatory_fids and not optional_fids:
                continue
            base_fids = mandatory_fids if mandatory_fids else optional_fids
            hours = [int(df.loc[fid, "Wochenstunden"]) for fid in base_fids]
            if any(h != hours[0] for h in hours):
                mismatched_hours.append(subject_name)
                continue
            tage_required = hours[0]
            if tage_required <= 0:
                continue
            penalty = add_band_constraint(
                model,
                plan,
                df,
                TAGE,
                slots_range,
                subject_name,
                mandatory_fids,
                optional_fids,
                optional_classes,
                class_fids,
                W_BAND_OPTIONAL,
                tage=tage_required,
            )
            if penalty is not None:
                obj_terms.append(penalty)
            # Optional: Modelle mit unterschiedlichen Wochenstunden ignorieren einfach;
            # Debug lässt sich über Solver-Logs nachvollziehen.

    # -------- 12) Gleichmäßige Verteilung (Soft) --------
    if regeln.get("gleichverteilung", False) and W_EVEN_DIST > 0:
        belegte_stunden_klasse_tag = {}
        for klasse in KLASSEN:
            for tag in TAGE:
                belegte = [plan[(fid, tag, s)]
                           for fid in FACH_ID for s in slots_range
                           if str(df.loc[fid, 'Klasse']) == str(klasse)]
                var = model.NewIntVar(0, slots_per_day, f"stunden_{klasse}_{tag}")
                model.Add(var == sum(belegte))
                belegte_stunden_klasse_tag[(klasse, tag)] = var

        for klasse in KLASSEN:
            wochenstunden = sum(int(df.loc[fid, 'Wochenstunden'])
                                for fid in FACH_ID
                                if str(df.loc[fid, 'Klasse']) == str(klasse))
            avg = wochenstunden // len(TAGE)
            for tag in TAGE:
                diff = model.NewIntVar(0, slots_per_day, f"abweichung_{klasse}_{tag}")
                model.AddAbsEquality(diff, belegte_stunden_klasse_tag[(klasse, tag)] - avg)
                obj_terms.append(W_EVEN_DIST * diff)

    # -------- Objective setzen --------
    if obj_terms:
        model.Minimize(sum(obj_terms))


def add_band_constraint(model, plan, df, TAGE, slots_range, band_fach, mandatory_fids, optional_fids, optional_classes, class_fids, weight_optional, tage=2):
    """
    Bandfach exakt 'tage' mal pro Woche,
    immer parallel in allen Klassen (gleicher Tag+Stunde).
    optionale Teilnehmer (AG) blockieren andere Fächer, sind aber nicht verpflichtend.
    """
    mandatory_fids = list(mandatory_fids or [])
    optional_fids = list(optional_fids or [])
    if not mandatory_fids and not optional_fids:
        return
    parallel_slots = []
    slots_by_day: dict[str, list[cp_model.IntVar]] = {tag: [] for tag in TAGE}
    for tag in TAGE:
        for std in slots_range:
            slot_vars = [plan[(fid, tag, std)] for fid in mandatory_fids]
            parallel = model.NewBoolVar(f"{band_fach}_parallel_{tag}_{std}")
            for v in slot_vars:
                model.Add(v == parallel)
            for fid in optional_fids:
                model.Add(plan[(fid, tag, std)] <= parallel)
            for klasse in optional_classes:
                other_fids = [other for other in class_fids.get(str(klasse), []) if other not in mandatory_fids and other not in optional_fids]
                for other in other_fids:
                    model.Add(plan[(other, tag, std)] == 0).OnlyEnforceIf(parallel)
            parallel_slots.append(parallel)
            slots_by_day[tag].append(parallel)

    model.Add(sum(parallel_slots) == tage)
    for tag, literals in slots_by_day.items():
        if literals:
            model.Add(sum(literals) <= 1)

    for fid in mandatory_fids:
        model.Add(sum(plan[(fid, tag, std)] for tag in TAGE for std in slots_range) == tage)
    optional_flags = []
    for fid in optional_fids:
        total = sum(plan[(fid, tag, std)] for tag in TAGE for std in slots_range)
        assigned = model.NewBoolVar(f"band_optional_{fid}")
        model.Add(total >= assigned)
        model.Add(total <= tage * assigned)
        optional_flags.append(assigned)

    penalty_expr = None
    if weight_optional > 0 and optional_flags:
        penalty_expr = weight_optional * (len(optional_flags) - sum(optional_flags))

    return penalty_expr
