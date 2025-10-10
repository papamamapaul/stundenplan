# stundenplan_regeln.py
import math

from ortools.sat.python import cp_model


def add_constraints(model, plan, df, FACH_ID, TAGE, KLASSEN, LEHRER, regeln, room_plan=None):
    """
    Baut alle Constraints und (falls aktiv) Soft-Objectives auf.

    Erwartete Spalten in df:
      - 'Fach', 'Klasse', 'Lehrer', 'Wochenstunden'
      - optional: 'Doppelstunde' in {'muss','kann','nein'}
      - optional: 'Nachmittag'   in {'muss','kann','nein'}

    regeln (Dict, via UI):
      - stundenbegrenzung (bool)
      - keine_hohlstunden (bool)            -> Soft (empfohlen)
      - keine_hohlstunden_hard (bool)       -> Hard (optional)
      - nachmittag_regel (bool)              -> Nachmittag nur Di (Std 7/8)
      - klassenlehrerstunde_fix (bool)
      - doppelstundenregel (bool)
      - einzelstunde_nur_rand (bool)
      - leseband_parallel (bool)
      - kuba_parallel (bool)
      - gleichverteilung (bool)
      - mittagsschule_vormittag (bool)       -> 4/≥5-Logik je Tag/Klasse

    Zusätzlich (NEU): Gewichte für Soft-Objectives – kommen aus regeln, haben Defaults:
      - W_GAPS_START, W_GAPS_INSIDE, W_EVEN_DIST, W_EINZEL_KANN
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

    obj_terms = []

    # -------- 1) Jede Fachstunde MUSS platziert werden --------
    for fid in FACH_ID:
        anzahl = int(df.loc[fid, 'Wochenstunden'])
        model.Add(sum(plan[(fid, tag, std)] for tag in TAGE for std in range(8)) == anzahl)

    # -------- 2) Keine Überlagerung (Lehrer/Klasse nie doppelt in einer Stunde) --------
    for tag in TAGE:
        for std in range(8):
            for lehrer in LEHRER:
                belegte = [plan[(fid, tag, std)] for fid in FACH_ID if df.loc[fid, 'Lehrer'] == lehrer]
                if belegte:
                    model.Add(sum(belegte) <= 1)
            for klasse in KLASSEN:
                belegte = [plan[(fid, tag, std)] for fid in FACH_ID if str(df.loc[fid, 'Klasse']) == str(klasse)]
                if belegte:
                    model.Add(sum(belegte) <= 1)

    # -------- 2b) Räume: Auslastung und Verfügbarkeit --------
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

    if room_assignments:
        grouped = {}
        for fid, rid in room_assignments.items():
            grouped.setdefault(rid, []).append(fid)
        for rid, fids in grouped.items():
            for tag in TAGE:
                for std in range(8):
                    vars_at_slot = [plan[(fid, tag, std)] for fid in fids]
                    if vars_at_slot:
                        model.Add(sum(vars_at_slot) <= 1)
        for fid, rid in room_assignments.items():
            for tag in TAGE:
                for std in range(8):
                    if not _room_slot_allowed(rid, tag, std):
                        model.Add(plan[(fid, tag, std)] == 0)

    # -------- 3) Tagesbegrenzung (Mo–Do max. 6, Fr max. 5) --------
    if regeln.get("stundenbegrenzung", True):
        for tag in ['Mo', 'Di', 'Mi', 'Do']:
            for klasse in KLASSEN:
                tagstunden = [plan[(fid, tag, std)]
                              for fid in FACH_ID for std in range(6)
                              if str(df.loc[fid, 'Klasse']) == str(klasse)]
                model.Add(sum(tagstunden) <= 6)
        for klasse in KLASSEN:
            tagstunden = [plan[(fid, 'Fr', std)]
                          for fid in FACH_ID for std in range(5)
                          if str(df.loc[fid, 'Klasse']) == str(klasse)]
            model.Add(sum(tagstunden) <= 5)

    # 3b) Wenn Tageslimit erreicht (6/5), MUSS Stunde 1 belegt sein (sonst optional)
    for tag in TAGE:
        max_tag = 6 if tag != 'Fr' else 5
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

    # -------- 4) Nachmittag grundsätzlich nur Dienstag (Std 7/8 = Index 6/7) --------
    if regeln.get("nachmittag_regel", True):
        for tag in ['Mo', 'Mi', 'Do', 'Fr']:
            for std in (6, 7):
                for fid in FACH_ID:
                    model.Add(plan[(fid, tag, std)] == 0)

    # -------- 5) Hohlstunden: Soft- oder Hard-Variante --------
    def _occ_vars_for_klasse_tag(klasse, tag, max_slots=8):
        occ = [model.NewBoolVar(f"occ_{klasse}_{tag}_{s}") for s in range(max_slots)]
        for s in range(max_slots):
            slots = [plan[(fid, tag, s)]
                     for fid in FACH_ID
                     if str(df.loc[fid, 'Klasse']) == str(klasse)]
            if slots:
                model.Add(sum(slots) >= occ[s])
                model.Add(sum(slots) <= len(slots) * occ[s])
            else:
                model.Add(occ[s] == 0)
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

    def _add_no_gap_hard(klasse, tag, max_slots=8):
        occ = _occ_vars_for_klasse_tag(klasse, tag, max_slots)
        any_day = model.NewBoolVar(f"any_{klasse}_{tag}")
        model.Add(sum(occ) >= 1).OnlyEnforceIf(any_day)
        model.Add(sum(occ) == 0).OnlyEnforceIf(any_day.Not())

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

    if regeln.get("keine_hohlstunden_hard", False):
        for klasse in KLASSEN:
            for tag in TAGE:
                _add_no_gap_hard(klasse, tag, max_slots=8)
    elif regeln.get("keine_hohlstunden", True):
        for klasse in KLASSEN:
            for tag in TAGE:
                occ = _occ_vars_for_klasse_tag(klasse, tag, max_slots=8)
                obj_terms += _add_no_gap_soft(occ)

    # -------- 6) Doppelstunden 'muss/kann/nein' inkl. max. 2 in Folge --------
    if regeln.get("doppelstundenregel", True):
        for fid in FACH_ID:
            anzahl_stunden = int(df.loc[fid, "Wochenstunden"])
            ds_rule = _str_val(df.loc[fid], "Doppelstunde", default="kann")

            pair_vars = []    # 2er-Blöcke
            single_vars = []  # Einzelstunden

            for tag in TAGE:
                stunden = [plan[(fid, tag, s)] for s in range(8)]
                # Nie 3 am Stück
                for i in range(6):
                    model.AddBoolOr([stunden[i].Not(), stunden[i+1].Not(), stunden[i+2].Not()])

                # Paare
                for s in range(7):
                    pair = model.NewBoolVar(f"pair_{fid}_{tag}_{s}")
                    model.Add(pair <= stunden[s])
                    model.Add(pair <= stunden[s+1])
                    model.Add(pair >= stunden[s] + stunden[s+1] - 1)
                    pair_vars.append(pair)

                # Singles
                for s in range(8):
                    single = model.NewBoolVar(f"single_{fid}_{tag}_{s}")
                    model.AddImplication(single, stunden[s])
                    if s > 0:
                        model.AddBoolOr([single.Not(), stunden[s-1].Not()])
                    if s < 7:
                        model.AddBoolOr([single.Not(), stunden[s+1].Not()])
                    single_vars.append(single)

            # Zählgleichung
            model.Add(2 * sum(pair_vars) + sum(single_vars) == anzahl_stunden)

            if ds_rule == "muss":
                n_einzel = anzahl_stunden % 2
                model.Add(sum(single_vars) == n_einzel)
                if regeln.get("einzelstunde_nur_rand", True) and n_einzel == 1:
                    # Mittige Singles verbieten
                    idx = 0
                    for tag in TAGE:
                        for s in range(8):
                            if 1 <= s <= 6:
                                model.Add(single_vars[idx] == 0)
                            idx += 1

            elif ds_rule == "nein":
                for v in pair_vars:
                    model.Add(v == 0)

            elif ds_rule == "kann":
                # Einzelstunden unattraktiv machen (Soft)
                obj_terms.append(W_EINZEL_KANN * sum(single_vars))

    # -------- 7) Nachmittag je Fach ('muss/kann/nein') --------
    if 'Nachmittag' in df.columns:
        for fid in FACH_ID:
            nm_rule = _str_val(df.loc[fid], "Nachmittag", default="kann")
            if nm_rule == "muss":
                anzahl = int(df.loc[fid, "Wochenstunden"])
                # Vormittag überall 0
                for tag in TAGE:
                    for std in range(6):
                        model.Add(plan[(fid, tag, std)] == 0)
                # Nur Dienstag 7/8 summieren
                model.Add(sum([plan[(fid, 'Di', s)] for s in (6, 7)]) == anzahl)
            elif nm_rule == "nein":
                for tag in TAGE:
                    for std in (6, 7):
                        model.Add(plan[(fid, tag, std)] == 0)
            # 'kann' -> keine Extra-Einschränkung (global gilt ggf. 4) )

    # -------- 8) Klassenlehrerstunde fix: Fr 5. Stunde --------
    if regeln.get("klassenlehrerstunde_fix", True):
        if "KL" in list(df['Fach'].unique()):
            for klasse in KLASSEN:
                fids = [fid for fid in FACH_ID
                        if str(df.loc[fid, 'Klasse']) == str(klasse)
                        and str(df.loc[fid, 'Fach']).strip().upper() == "KL"]
                for fid in fids:
                    for tag in TAGE:
                        for std in range(8):
                            if tag == "Fr" and std == 4:
                                model.Add(plan[(fid, tag, std)] == 1)
                            else:
                                model.Add(plan[(fid, tag, std)] == 0)

    # -------- 9) Vormittagsregel bei Mittagsschule (4 / ≥5) --------
    if regeln.get("mittagsschule_vormittag", True):
        for klasse in KLASSEN:
            for tag in TAGE:
                vormittag = [plan[(fid, tag, s)]
                             for fid in FACH_ID for s in range(6)
                             if str(df.loc[fid, 'Klasse']) == str(klasse)]
                nachmittag = [plan[(fid, tag, s)]
                              for fid in FACH_ID for s in (6, 7)
                              if str(df.loc[fid, 'Klasse']) == str(klasse)]
                mittags = model.NewBoolVar(f"mittag_{klasse}_{tag}")
                model.Add(sum(nachmittag) >= 1).OnlyEnforceIf(mittags)
                model.Add(sum(nachmittag) == 0).OnlyEnforceIf(mittags.Not())
                model.Add(sum(vormittag) == 4).OnlyEnforceIf(mittags)
                model.Add(sum(vormittag) >= 5).OnlyEnforceIf(mittags.Not())
                model.Add(sum(vormittag) >= 4)

    # -------- 10) Bandfächer (Leseband/Kuba) parallel, 2×/Woche --------
    if regeln.get("leseband_parallel", True):
        add_band_constraint(model, plan, df, FACH_ID, TAGE, KLASSEN, band_fach="Leseband", tage=2)
    if regeln.get("kuba_parallel", True):
        add_band_constraint(model, plan, df, FACH_ID, TAGE, KLASSEN, band_fach="Kuba", tage=2)

    # -------- 11) Gleichmäßige Verteilung (Soft) --------
    if regeln.get("gleichverteilung", False) and W_EVEN_DIST > 0:
        belegte_stunden_klasse_tag = {}
        for klasse in KLASSEN:
            for tag in TAGE:
                belegte = [plan[(fid, tag, s)]
                           for fid in FACH_ID for s in range(8)
                           if str(df.loc[fid, 'Klasse']) == str(klasse)]
                var = model.NewIntVar(0, 8, f"stunden_{klasse}_{tag}")
                model.Add(var == sum(belegte))
                belegte_stunden_klasse_tag[(klasse, tag)] = var

        for klasse in KLASSEN:
            wochenstunden = sum(int(df.loc[fid, 'Wochenstunden'])
                                for fid in FACH_ID
                                if str(df.loc[fid, 'Klasse']) == str(klasse))
            avg = wochenstunden // len(TAGE)
            for tag in TAGE:
                diff = model.NewIntVar(0, 8, f"abweichung_{klasse}_{tag}")
                model.AddAbsEquality(diff, belegte_stunden_klasse_tag[(klasse, tag)] - avg)
                obj_terms.append(W_EVEN_DIST * diff)

    # -------- Objective setzen --------
    if obj_terms:
        model.Minimize(sum(obj_terms))


def add_band_constraint(model, plan, df, FACH_ID, TAGE, KLASSEN, band_fach, tage=2):
    """
    Bandfach (z.B. 'Leseband', 'Kuba') exakt 'tage' mal pro Woche,
    immer parallel in allen Klassen (gleicher Tag+Stunde).
    """
    band_fids = [fid for fid in FACH_ID
                 if str(df.loc[fid, "Fach"]).strip().lower() == band_fach.lower()]
    if len(band_fids) != len(KLASSEN):
        return  # Daten passen nicht zur Bandlogik

    parallel_slots = []
    for tag in TAGE:
        for std in range(8):
            slot_vars = [plan[(fid, tag, std)] for fid in band_fids]
            parallel = model.NewBoolVar(f"{band_fach}_parallel_{tag}_{std}")
            for v in slot_vars:
                model.Add(v == parallel)
            parallel_slots.append(parallel)

    model.Add(sum(parallel_slots) == tage)

    for fid in band_fids:
        model.Add(sum(plan[(fid, tag, std)] for tag in TAGE for std in range(8)) == tage)
