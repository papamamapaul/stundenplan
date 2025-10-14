# stundenplan_app.py
import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
from ortools.sat.python import cp_model
import os
from stundenplan_regeln import add_constraints

st.set_page_config(page_title="Stundenplan-Optimierer", layout="wide")

st.title("🔢 Stundenplan-Optimierer für Grundschulen")
st.markdown("""
Lade hier deine Excel-Tabelle (`stundenverteilung.xlsx`) – Spalten:
**Fach, Klasse, Lehrer, Wochenstunden** (optional: **Doppelstunde, Nachmittag**).
""")

default_path = "stundenverteilung.xlsx"

# ---------------- Sidebar: Regeln ----------------
st.sidebar.header("Regeln")
regeln = {
    "stundenbedarf_vollstaendig": st.sidebar.checkbox("Alle Requirements vollständig planen", value=True),
    "keine_lehrerkonflikte": st.sidebar.checkbox("Lehrkräfte nicht doppelt belegen", value=True),
    "keine_klassenkonflikte": st.sidebar.checkbox("Klassen nicht doppelt belegen", value=True),
    "raum_verfuegbarkeit": st.sidebar.checkbox("Raumverfügbarkeiten nutzen", value=True),
    "basisplan_fixed": st.sidebar.checkbox("Feste Basisplan-Slots erzwingen", value=True),
    "basisplan_flexible": st.sidebar.checkbox("Flexible Basisplan-Slots nutzen", value=True),
    "stundenbegrenzung": st.sidebar.checkbox("Max. 6/5 Stunden je Tag/Freitag", value=True),
    "stundenbegrenzung_erste_stunde": st.sidebar.checkbox("Bei vollem Tag 1. Stunde belegen", value=True),
    "nachmittag_regel": st.sidebar.checkbox("Nachmittagsunterricht nur Dienstag", value=True),
    "fach_nachmittag_regeln": st.sidebar.checkbox("Fachspezifische Nachmittag-Regeln", value=True),
    "keine_hohlstunden": st.sidebar.checkbox("Keine Hohlstunden (Soft: Lücken minimieren)", value=True),
    "keine_hohlstunden_hard": st.sidebar.checkbox("Keine Hohlstunden (Hard, konvexer Block)", value=False),
    "doppelstundenregel": st.sidebar.checkbox("Doppelstundenregel (muss/kann/nein + max. 2 in Folge)", value=True),
    "einzelstunde_nur_rand": st.sidebar.checkbox("Einzelstunde nur an Randstunden (für 'muss' ungerade)", value=True),
    "bandstunden_parallel": st.sidebar.checkbox("Bandfächer parallel planen", value=True),
    "gleichverteilung": st.sidebar.checkbox("Gleichmäßige Verteilung über die Woche (Soft)", value=True),
    "mittagsschule_vormittag": st.sidebar.checkbox("Vormittagsregel bei Mittagsschule (4 / ≥5)", value=True),
}

# ---------------- NEU: Gewichte der Soft-Objectives ----------------
st.sidebar.header("Gewichtungen (Soft-Ziele)")
regeln["W_GAPS_START"]  = st.sidebar.slider("Gewicht: Startlücke (freie 1. Stunde bestrafen)", 0, 50, 2)
regeln["W_GAPS_INSIDE"] = st.sidebar.slider("Gewicht: Hohlstunden (0→1 Übergänge)", 0, 50, 3)
regeln["W_EVEN_DIST"]   = st.sidebar.slider("Gewicht: Gleichverteilung über die Woche", 0, 50, 1)
regeln["W_EINZEL_KANN"] = st.sidebar.slider("Gewicht: Einzelstunden-Penalty (bei 'kann')", 0, 50, 5)

# ---------------- Solver / Suche ----------------
st.sidebar.header("Solver / Suche")
multi_start = st.sidebar.checkbox("Mehrere Versuche (Multi-Start)", value=True)
max_attempts = st.sidebar.number_input("Max. Versuche", min_value=1, max_value=200, value=25, step=1)
patience = st.sidebar.number_input("Early-Stopping: Patience (Versuche ohne Verbesserung)", min_value=1, max_value=50, value=5, step=1)
time_per_attempt = st.sidebar.number_input("Zeitlimit pro Versuch (Sek.)", min_value=1.0, max_value=300.0, value=10.0, step=1.0)
randomize_search = st.sidebar.checkbox("Randomize Search", value=True)
base_seed = st.sidebar.number_input("Basis-Seed", min_value=0, max_value=10_000, value=42, step=1)
seed_step = st.sidebar.number_input("Seed-Inkrement pro Versuch", min_value=1, max_value=10_000, value=17, step=1)
use_value_hints = st.sidebar.checkbox("Value Hints (gleichmäßig vormittags vorfüllen)", value=True)
show_progress = st.sidebar.checkbox("Score-Verlauf anzeigen", value=True)

# ---------------- Datei laden ----------------
if os.path.exists(default_path):
    st.success(f"Datei **{default_path}** gefunden und verwendet.")
    df = pd.read_excel(default_path)
    uploaded_file = None
else:
    uploaded_file = st.file_uploader("Excel-Datei mit Stundenverteilung hochladen", type=["xlsx"])
    df = None
    if uploaded_file is not None:
        df = pd.read_excel(uploaded_file)
        st.success("Excel-Datei erfolgreich geladen!")

# ---------------- Session State ----------------
for key in ["plan_matrix", "KLASSEN", "LEHRER", "analyse_lehrer", "analyse_klasse", "status_solver", "search_history"]:
    if key not in st.session_state:
        st.session_state[key] = None

# ---------------- Farbschema ----------------
def generate_color_palette(n):
    base_colors = [
        "#B7E5DD", "#C9BBE5", "#F7C59F", "#F7B2B7", "#B5B2C2", "#F9E2AE", "#F3B391", "#C2E7F7",
        "#FFC9DE", "#B6E2D3", "#F6B1C3", "#E5C7B2", "#B2D6E5", "#D5B2E5", "#B2E5B7", "#F7D6B7",
        "#C2B5E5", "#E5B2B5", "#E5E5B2", "#B2E5E2"
    ]
    if n <= len(base_colors):
        return base_colors[:n]
    cmap = plt.get_cmap('tab20')
    extra = [matplotlib.colors.rgb2hex(cmap(i)) for i in range(n - len(base_colors))]
    return base_colors + extra

def get_fach_colors(df):
    faecher = sorted(df['Fach'].astype(str).str.strip().unique())
    return dict(zip(faecher, generate_color_palette(len(faecher))))

# ---------------- Helper: Value Hints (jetzt mit model.AddHint) ----------------
def add_value_hints_evenly(model, plan, df, FACH_ID, TAGE, slots_per_day=6, seed=0):
    """
    Setzt Hints auf das Modell (nicht auf den Solver!):
    - Default 0 für alle Slots
    - dann pro Fach 'need' mal 1 auf zufällige Vormittags-Slots (bis slots_per_day)
    """
    import random
    rnd = random.Random(seed)

    # Erst alles auf 0 „hinweisen“
    for fid in FACH_ID:
        for tag in TAGE:
            for std in range(8):
                model.AddHint(plan[(fid, tag, std)], 0)

    # Dann pro Fach gleichmäßig (vormittags) 1er-Hints setzen
    for fid in FACH_ID:
        need = int(df.loc[fid, 'Wochenstunden'])
        candidates = [(tag, s) for tag in TAGE for s in range(slots_per_day)]
        rnd.shuffle(candidates)
        for (tag, s) in candidates[:need]:
            model.AddHint(plan[(fid, tag, s)], 1)

# ---------------- Score-Funktion ----------------
def compute_score_from_objective(model, solver):
    """
    ObjectiveValue (Summe Soft-Penalties) -> Score (größer ist besser).
    score = 1000 / (1 + penalty)
    Falls kein Objective gesetzt ist, 1000.
    """
    # In manchen OR-Tools-Versionen gibt es HasObjective(), in anderen nicht.
    has_obj = hasattr(model, "HasObjective")
    if has_obj and model.HasObjective():
        penalty = solver.ObjectiveValue()
        return 1000.0 / (1.0 + max(0.0, penalty))
    try:
        # Fallback: Wenn kein Objective gesetzt, gibt ObjectiveValue() evtl. 0 zurück.
        penalty = solver.ObjectiveValue()
        return 1000.0 / (1.0 + max(0.0, penalty))
    except Exception:
        return 1000.0

# ---------------- Hauptrechnung ----------------
if df is not None:
    needed = {"Fach", "Klasse", "Lehrer", "Wochenstunden"}
    if not needed.issubset(set(df.columns)):
        st.error("Die Excel-Datei braucht die Spalten: 'Fach', 'Klasse', 'Lehrer', 'Wochenstunden' (+ optional 'Doppelstunde','Nachmittag').")
    else:
        # optionale Spalten normalisieren
        if "Doppelstunde" not in df.columns:
            df["Doppelstunde"] = "kann"
        if "Nachmittag" not in df.columns:
            df["Nachmittag"] = "kann"
        df["Doppelstunde"] = df["Doppelstunde"].astype(str).str.strip().str.lower()
        df["Nachmittag"]   = df["Nachmittag"].astype(str).str.strip().str.lower()

        if st.button("Stundenplan berechnen / verbessern"):
            TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr']
            KLASSEN = [str(int(x)) if pd.notnull(x) and str(x).isdigit() else str(x)
                       for x in sorted(df['Klasse'].dropna().unique(), key=lambda v: int(str(v)) if str(v).isdigit() else str(v))]
            LEHRER = sorted(df['Lehrer'].dropna().astype(str).unique())
            FACH_ID = df.index.tolist()

            def solve_once(seed):
                # Neues Modell pro Versuch
                model = cp_model.CpModel()
                plan = {(fid, tag, std): model.NewBoolVar(f'plan_{fid}_{tag}_{std}')
                        for fid in FACH_ID for tag in TAGE for std in range(8)}
                # Constraints
                add_constraints(model, plan, df, FACH_ID, TAGE, KLASSEN, LEHRER, regeln)

                # Hints (jetzt korrekt am Modell)
                if use_value_hints:
                    add_value_hints_evenly(model, plan, df, FACH_ID, TAGE, slots_per_day=6, seed=seed)

                # Solver
                solver = cp_model.CpSolver()
                solver.parameters.max_time_in_seconds = float(time_per_attempt)
                solver.parameters.num_search_workers = 8
                solver.parameters.random_seed = int(seed)
                solver.parameters.randomize_search = bool(randomize_search)

                status = solver.Solve(model)
                return status, solver, model, plan

            # Suche mit Early-Stopping nach Score
            best_pack = None
            best_score = None
            history = []
            no_improve = 0

            total_attempts = int(max_attempts) if multi_start else 1
            for attempt_idx in range(total_attempts):
                seed = int(base_seed + attempt_idx * seed_step)
                status, solver, model, plan = solve_once(seed)
                if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                    history.append({"Versuch": attempt_idx+1, "Seed": seed, "Score": 0.0, "Status": "INFEASIBLE"})
                    no_improve += 1
                else:
                    score = compute_score_from_objective(model, solver)
                    history.append({"Versuch": attempt_idx+1, "Seed": seed, "Score": score, "Status": "OK"})
                    if (best_score is None) or (score > best_score):
                        best_score = score
                        best_pack = (status, solver, model, plan, TAGE, KLASSEN, LEHRER, FACH_ID)
                        no_improve = 0
                    else:
                        no_improve += 1

                # Early-Stopping
                if multi_start and no_improve >= int(patience):
                    break

            # Speichern & Anzeigen History
            hist_df = pd.DataFrame(history)
            st.session_state["search_history"] = hist_df

            if best_pack is None:
                st.error("Keine Lösung gefunden! Tipp: Soft-Hohlstunden aktivieren, Hard deaktivieren; Randomize & Seeds variieren; Zeitlimit erhöhen.")
                st.session_state['plan_matrix'] = None
                st.session_state['status_solver'] = cp_model.INFEASIBLE
            else:
                status, solver, model, plan, TAGE, KLASSEN, LEHRER, FACH_ID = best_pack
                st.success(f"Beste Lösung gefunden. Score: {best_score:.2f}")

                # Plan in Matrix überführen
                plan_matrix = [["" for _ in range(20)] for _ in range(8)]
                spalten_index = {(tag, k): 4*tag_idx + klassen_idx
                                 for tag_idx, tag in enumerate(TAGE)
                                 for klassen_idx, k in enumerate(KLASSEN)}
                # Analysen
                df['Klasse_str'] = df['Klasse'].astype(str)
                stunden_klasse_vorlage = df.groupby('Klasse_str')['Wochenstunden'].sum()
                stunden_lehrer_vorlage = df.groupby('Lehrer')['Wochenstunden'].sum()
                stunden_lehrer_verplant = {l: 0 for l in LEHRER}
                stunden_klasse_verplant = {str(k): 0 for k in KLASSEN}
                lehr_analyse = []
                klass_analyse = []

                for fid in FACH_ID:
                    fach = str(df.loc[fid, 'Fach']).strip()
                    klasse = str(df.loc[fid, 'Klasse'])
                    lehrer = str(df.loc[fid, 'Lehrer'])
                    eintrag = f"{fach}\n({lehrer})"
                    count = 0
                    for tag in TAGE:
                        for std in range(8):
                            if solver.Value(plan[(fid, tag, std)]) == 1:
                                count += 1
                                col = spalten_index[(tag, klasse)]
                                plan_matrix[std][col] = eintrag
                    stunden_lehrer_verplant[lehrer] = stunden_lehrer_verplant.get(lehrer, 0) + count
                    stunden_klasse_verplant[klasse] = stunden_klasse_verplant.get(klasse, 0) + count

                for l in LEHRER:
                    geplant = int(stunden_lehrer_vorlage.get(l, 0))
                    verplant = stunden_lehrer_verplant.get(l, 0)
                    lehr_analyse.append({"Lehrer": l, "Verplant": verplant, "Geplant": geplant, "Differenz": verplant - geplant})

                for k in KLASSEN:
                    geplant = int(stunden_klasse_vorlage.get(str(k), 0))
                    verplant = stunden_klasse_verplant.get(str(k), 0)
                    klass_analyse.append({"Klasse": str(k), "Verplant": verplant, "Geplant": geplant, "Differenz": verplant - geplant})

                st.session_state['plan_matrix'] = plan_matrix
                st.session_state['KLASSEN'] = KLASSEN
                st.session_state['LEHRER'] = LEHRER
                st.session_state['analyse_lehrer'] = lehr_analyse
                st.session_state['analyse_klasse'] = klass_analyse
                st.session_state['status_solver'] = status

                # Score Verlauf zeigen
                if show_progress and st.session_state["search_history"] is not None:
                    st.subheader("🔎 Score-Verlauf")
                    st.line_chart(
                        st.session_state["search_history"].set_index("Versuch")["Score"],
                        height=240
                    )
                    st.dataframe(st.session_state["search_history"], use_container_width=True)

# ---------------- Anzeige ----------------
if st.session_state.get('plan_matrix') is not None:
    plan_matrix = st.session_state['plan_matrix']
    KLASSEN = st.session_state['KLASSEN']
    LEHRER = st.session_state['LEHRER']
    lehr_analyse = st.session_state['analyse_lehrer']
    klass_analyse = st.session_state['analyse_klasse']

    def get_fach_colors(df):
        faecher = sorted(df['Fach'].astype(str).str.strip().unique())
        return dict(zip(faecher, generate_color_palette(len(faecher))))

    fach_colors = get_fach_colors(df)

    with st.expander("Farb-Legende"):
        col1, col2, col3, col4 = st.columns(4)
        items = list(fach_colors.items())
        for i, (fach, farbe) in enumerate(items):
            c = [col1, col2, col3, col4][i % 4]
            c.markdown(
                f"<span style='background-color:{farbe};padding:4px 12px;border-radius:6px;display:inline-block;margin:4px'>{fach}</span>",
                unsafe_allow_html=True
            )

    st.subheader("👩‍🏫 Lehrer filtern")
    lehrer_filter = st.multiselect(
        "Nur diese Lehrer anzeigen (leer = alle):",
        options=LEHRER,
        default=LEHRER,
        key="lehrerfilter"
    )
    filtered_plan_matrix = [
        [
            (cell if (not lehrer_filter or any(f"({l})" in str(cell) for l in lehrer_filter)) else "")
            for cell in row
        ]
        for row in plan_matrix
    ]

    spalten = []
    for tag in ['Mo', 'Di', 'Mi', 'Do', 'Fr']:
        for k in KLASSEN:
            spalten.append(f"{tag}-{k}")
    df_plan = pd.DataFrame(filtered_plan_matrix, columns=spalten)
    df_plan.insert(0, "Stunde", range(1, 9))

    def cell_html(val):
        if not val or not isinstance(val, str):
            return ""
        parts = str(val).split("\n")
        fach = parts[0].strip()
        lehrer = parts[1].strip() if len(parts) > 1 else ""
        return f"<div style='font-size:15px;'><b>{fach}</b><br><span style='font-size:11px'>{lehrer}</span></div>"

    def cell_bg(val):
        if not val or not isinstance(val, str):
            return ""
        fach = str(val).split("\n")[0].strip()
        color = fach_colors.get(fach, "#fff")
        return f"background-color:{color}; color:#222; font-weight:600; border-radius:8px; white-space:pre-wrap; text-align:center; vertical-align:middle;"

    styled_df = df_plan.style.applymap(cell_bg, subset=df_plan.columns[1:])
    styled_df = styled_df.format(cell_html, subset=df_plan.columns[1:], escape="html")
    st.markdown("### 📋 Ergebnis: Stundenplan")
    st.write(styled_df.to_html(escape="html"), unsafe_allow_html=True)

    with st.expander("🧑‍🏫 Analyse: Stunden pro Lehrer", expanded=False):
        st.dataframe(pd.DataFrame(lehr_analyse), use_container_width=True)

    with st.expander("🏫 Analyse: Stunden pro Klasse", expanded=False):
        st.dataframe(pd.DataFrame(klass_analyse), use_container_width=True)
