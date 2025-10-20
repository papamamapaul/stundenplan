# Stundenplan-Tool – Developer Overview

Dieses Repository enthält einen Prototypen für ein webbasiertes Stundenplan‑System. Das Projekt ist bewusst leichtgewichtig gehalten: Backend (FastAPI/SQLModel) und Frontend (Vanilla JS + DaisyUI/Tailwind) laufen ohne Build‑Step und dienen als playground, um Datenmodell, Solver-Anbindung und UI-Flows auszuarbeiten.

Die folgenden Abschnitte dokumentieren den aktuellen Stand – insbesondere die Stellen, die in den letzten Iterationen überarbeitet wurden (Basisplan-Optionen, neue Planungsansicht, Solver-Anpassungen). Die Notizen sind so aufgebaut, dass sie problemlos in einen neuen Chatkontext oder eine Wissensbasis übertragen werden können.

---

## 1. Schnellstart

```bash
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Development-Server starten (Frontend wird als StaticFiles unter /ui ausgeliefert)
uvicorn backend.app.main:app --reload
```

- API: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:8000/ui/index.html`
- SQLite-Datenbank: `backend.db` (mit SQLModel/Alembic Migrations verwaltet)

---

## 2. Backend-Überblick

### 2.1 Struktur

- `backend/app/main.py` – FastAPI-Instantierung, Router-Registrierung, Default-RuleProfile-Seeding
- `backend/app/models.py` – SQLModel-Tabellen (Teachers, Subjects, Requirements, Plans, BasisPlan, …)
- `backend/app/routers/` – REST-Endpunkte (Stammdaten, Plans, Basisplan, …)
- `backend/app/services/solver_service.py` – OR-Tools Adaption (`solve_best_plan`)
- `stundenplan_regeln.py` – eigentliche Constraint-/Objective-Definition

### 2.2 Wichtige Modelle

- **Subject**: enthält neben Raum/Default-Einstellungen jetzt `is_bandfach`, `is_ag_foerder` sowie optional `alias_subject_id` (z. B. Leseband → Deutsch).
- **Requirement**: `version_id` und `participation` (`curriculum`/`ag`) ermöglichen Curriculum- und AG-Stunden nebeneinander.
- **BasisPlan**: `data` (JSON) verwaltet `windows`, `fixed` und `flexible`.  
  - `fixed`: fixe Slot-Zuweisungen (pro Klasse/Slot → Fach erzwingen)  
  - `flexible`: neue „Range“-Optionen (eine Menge alternativer Slots für ein Fach)
- **Plan**: neben Score/Status nun `comment`, `version_id` sowie Snapshots (`rules_snapshot`, `rule_keys_active`, `params_used`).

### 2.3 /plans-Workflow (vereinfacht)

1. **Analyse** (`GET /plans/analyze`):  
   Lädt Requirements (optional gefiltert per `version_id`), aggregiert Klassen-/Lehrer-Stunden und liefert Flags (Doppelstunde/Nachmittag).

2. **Regel-Liste** (`GET /plans/rules`):  
   Frontend-Definition der Bool-Schalter und Weights (inkl. Labels).

3. **Plan-Generierung** (`POST /plans/generate`):
   - Lädt Requirements (per Version), Stammdaten, Basisplan.
   - Mappt `basisplan.data.fixed` → `fixed_slots`, `basisplan.data.flexible` → Gruppen aus (tag, slot).
   - Übergibt Filter an `solve_best_plan` inklusive `params` (multi-start, max_attempts, usw.).
   - Speichert Plan + Slots in DB, gibt Response mit Slot-Liste zurück.
   - Fehlschlag → `HTTP 422` mit `"Keine Lösung gefunden."`.

4. **Plan-Update** (`PUT /plans/{id}`):  
   Ermöglicht nachträgliches Umbenennen/Kommentieren.

### 2.4 Solver-spezifische Anpassungen

- **Fixed Slots**: Jeder `(fid, tag, std)` wird als Hard Constraint `== 1` gesetzt *(Toggle `basisplan_fixed`)*.
- **Flexible Gruppen**: Je Gruppe (fach-zu-klasse) wird `sum(slots) == 1` hinzugefügt *(Toggle `basisplan_flexible`)*.
- **Klassen-Zeitfenster**: Basisplan-„Allowed“-Raster sperrt Slots pro Klasse *(Toggle `basisplan_windows`)*.
- **Bandfächer & AGs**: Alle Fächer mit `is_bandfach` werden parallel über die beteiligten Klassen gelegt *(Toggle `bandstunden_parallel`)*. Pflichtteilnehmer sitzen fest, optionale AG-Teilnehmer blocken andere Unterrichtsstunden ohne Pflichtbelegung.
- **Alias-Fächer**: Über `alias_subject_id` geklammerte Fächer (z. B. Deutsch + Leseband) teilen sich Doppelstunden- und Tagesgrenzen.
- **Globale Regeln**: Tageslimit, Vormittagsminimum, Nachmittags-Vorgaben etc. lassen sich vollständig deaktivieren (`stundenbegrenzung`, `mittagsschule_vormittag`, `fach_nachmittag_regeln`).
- **Konfliktfreiheit**: Lehrkraft-/Klassen-Kollisionen, Stundenbedarf und Raumfenster sind explizit schaltbar (`keine_lehrerkonflikte`, `keine_klassenkonflikte`, `stundenbedarf_vollstaendig`, `raum_verfuegbarkeit`).
- **Soft-Ziele**: Gewichte bleiben über `W_*` manipulierbar; `gleichverteilung` und Hohlstunden-Schalter definieren, ob sie aktiv sind.
- **AG/Förder**: Requirements können als `participation='ag'` markiert werden (z. B. Chor). Sie blocken Slots, ohne den Stundenbedarf hart zu erzwingen.
- **Solver-Parameter**: Standardwerte in `GenerateParams`; Frontend kann inzwischen alle Felder überschreiben.

---

## 3. Frontend-Überblick

### 3.1 Struktur

- `frontend/index.html` – statische Hülle, DaisyUI/Tailwind via CDN
- `frontend/src/main.js` / `router.js` – Hash-Routing, Navigation
- `frontend/src/views/`  
  - `basisplan.js` – Raster-Editor (inkl. Fix/Option-Mode, flexible Gruppen)  
  - `distribution.js` – Lehrer-Stundenverteilung  
  - `plan.js` – **neu**: Planberechnung & Analyse  
  - `maintenance.js` – Stammdatenverwaltung
- `frontend/src/api/` – Fetch-Wrapper für Backend-Endpunkte

### 3.2 Neue Planungsansicht (`views/plan.js`)

**Features**
- Auswahl: Planname, Kommentar, Stundenverteilungs-Version, Regelprofil.
- Regeldialog: Liste der Bool-Schalter/Gewichtungen im Modal; Standardwerte aus Profil, overrides trackbar.
- Solver-Parameter (Accordion): Editierbare Inputs (`multi_start`, `max_attempts`, `time_per_attempt`, etc.).
- Generieren: POST `/plans/generate` → zeigt Planmatrix pro Klasse (Tage × Stunden).
- Ergebnisansicht: Mehrspaltiges Tages-Grid mit allen ausgewählten Klassen nebeneinander (Fach-/Lehrerkürzel, Farbcode je Fach, optional filterbar).
- Speichern: PUT `/plans/{id}` (Name/Kommentar persistieren).
- Analyse-Tab: `/plans/analyze?version_id=…` (Klassen-, Lehrer-, Fach-Statistiken, Flags).
- Debug-Logging (nur Konsole) vom Request/Fehlern.

**State-Management (Auszug)**
```js
const state = {
  versions: [],
  selectedVersionId: null,
  ruleProfiles: [],
  ruleBaseBools: new Map(),
  ruleBaseWeights: new Map(),
  ruleValuesBools: new Map(),
  ruleValuesWeights: new Map(),
  params: { ...DEFAULT_PARAMS },
  paramInputs: new Map(),
  generatedPlans: [],
  analysis: null,
  activeTab: 'results',
};
```

### 3.3 Basisplan („Option“-Modus)

- Palette-Toggle „Fix / Option“.
- Option-Modus: Drag & Drop erzeugt flexible Gruppe → `flexible[classId] = [{id, subjectId, slots:[...]}`.
- Späteres Hinzufügen via `+` Button, Entfernen einzelner Slots oder kompletter Gruppen.
- Solver mappt diese Gruppen auf `sum(slots) == 1`.

---

## 4. Bekannte Einschränkungen & ToDos

| Thema | Beschreibung | Idee/Next Steps |
|-------|--------------|-----------------|
| **Fehlerfeedback Solver** | Bei 422 („Keine Lösung gefunden.“) gibt es nur Status/Console-Ausgabe. | Im Plan-View eine sichtbare Info einblenden (mit Link zum Analyse-Tab oder Troubleshooting-Hints). |
| **Analyse-Aktualisierung** | Analyse wird beim Version-Wechsel / nach Generierung aktualisiert, aber nicht bei Regel-/Paramänderungen (nur indirekt). | Optional: Analyse automatisch aktualisieren, sobald Overrides die Stundenverteilung beeinflussen könnten. |
| **Basisplan > Plan Sync** | UI zeigt Optionen korrekt, jedoch keine direkte Validierung gegen Curriculum (z. B. zu viele Slots). | Ein Warnsystem hinzufügen, das Über-/Unterbuchungen anzeigt, bevor der Solver läuft. |
| **Regelübersicht** | Badge zeigt „Overrides“ und „Params“, aber keine Details. | Detailtooltips oder Liste der abweichenden Keys ergänzen. |
| **Persistenz Param/Rule Overrides** | Momentan per In-Memory-State – kein Speichern über Reload hinaus. | Feature-Request: Settings per Version/Profil speichern. |
| **Automatisierte Tests** | Momentan keine Unit-/Integrationstests für Solver/Frontend. | Ggf. Pytest/Playwright-Scaffolding ergänzen. |
| **fehlendes Favicon** | Browser-404 auf `favicon.ico`. | Datei nachlegen oder Link entfernen. |

---

## 5. Nächste Schritte / Übergabe-Hinweise

1. **Solver-Fehler analysieren**: Bei 422 den Analyse-Tab und Basisplan prüfen; ggf. Regeln lockern oder Param-Schrauben anziehen (`max_attempts`, `time_per_attempt`).
2. **UX-Verbesserungen**: Highlight `Keine Lösung gefunden.` direkt im UI, ggf. Troubleshooting-Panel verlinken.
3. **Param/Rule Defaults**: Beim Laden pro Version/Profil klare Defaults setzen (aktuell Standard `DEFAULT_PARAMS` + Profil-Regeln).
4. **Dokumentation erweitern**: Gerade das Basisplan-Datenformat (`data.fixed`/`data.flexible`) im Backend dokumentieren, falls externe Tools darauf zugreifen sollen.
5. **Optional**: Persistente Speicherung von Solver-Parametern je Planprofil / Backend-API zum Lesen/Schreiben der letzten Parameter.

Dieses README spiegelt den Stand nach den jüngsten Iterationen wider. Neue Aufgaben sollten auf den ToDo-Listen ergänzt und die Analyse-/Plan-View bei weiteren Feature-Sprints fortgeführt werden.
