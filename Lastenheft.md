# Lastenheft Stundenplan-Tool

## 1. Zielsetzung

Entwicklung einer webbasierten Anwendung zur Planung, Verwaltung und Erstellung von Stundenplänen an Schulen. Die Software unterstützt Schulleitungen und Planungsteams bei der Pflege der Stammdaten, der Zuweisung von Lehrdeputaten sowie der Erstellung und Verwaltung verschiedener Planvarianten. Fokus liegt auf modularer Frontend-Architektur, Wiederverwendbarkeit (Komponenten) und kompakten, visuell klaren Übersichten.

## 2. Anwender und Rahmenbedingungen

- **Primäre Nutzer:** Schulleitung, Stundenplaner*innen, Verwaltung.
- **Sekundäre Nutzer:** ggf. Lehrkräfte zur Sichtung (später).
- **Mehrbenutzerfähigkeit:** keine Authentifizierung für MVP, jedoch Datenmodell ohne Nutzerbindung, sodass spätere Multiuser-Funktionen möglich bleiben.
- **Technische Basis:** FastAPI + SQLModel Backend (vorhanden), OR-Tools Solver. Neues moduläres Frontend (z. B. Vite + React/TypeScript oder vergleichbar) mit Komponentenstruktur.

## 3. Leistungsumfang

### 3.1 Stammdatenverwaltung

1. **Schulgrunddaten**
   - Name, Adressdaten.
   - Schulart / Organisationsform (Halbtag, Ganztag, gebunden etc.).
   - Globale Parameter (z. B. Standard-Schultage, mögliche Unterrichtsblöcke).

2. **Lehrkräfte**
   - Stammdaten: Name, Kürzel, Deputatsstunden.
   - Arbeitstage / Verfügbarkeiten (Raster nach Tagen und Stunden).
   - Solver-Option, um die Arbeitstage verbindlich zu respektieren (`lehrer_arbeitstage`).
   - Pflichtanwesenheiten (z. B. Konferenzen) und Reservierungen (optional).
   - Farbverwaltung: automatischer Farbzyklus pro Account (inkl. Import/Export) für einheitliche Lehrkraft-Badges im gesamten UI; Farbe ist editierbar und wird überall konsistent dargestellt.
   - „Lehrkräfte-Pool“ als spezieller Datensatz (Kürzel `POOL`): unbegrenztes Deputat, von Pflichtfeldern ausgenommen, in der Oberfläche klar abgegrenzt (grau dargestellt, nicht löschbar).
   - UI: Tabellenbasierte Pflege mit Inline-Editing (Blur → sofortiges Speichern), letzte Zeile als Eingabezeile für neue Einträge.
   - Badge-Komponente mit Kürzel-Initialen (live-Update bei Eingaben), klickbar für Detail-Overlay (Deputat, Arbeitstage usw.).

3. **Fächer**
   - Fachname, Kürzel, Farbe (wird überall konsistent genutzt).
   - Doppelstunden-Regeln (muss/kann/darf nicht).
   - Pflicht-Raum (z. B. Schwimmhalle).
   - Stundenbedarf pro Klassenstufe (Matrix Klasse × Stunden).
   - Klassenstufen-spezifische Konfiguration (Wochenstunden, Doppelstundenmodus, Nachmittagspflicht) zentral in der Fächerpflege; Änderungen werden automatisch mit Requirements synchronisiert.

4. **Räume**
   - Raumname, Typ, Kapazität, Klassenraum-Flag.
   - Verfügbarkeitsraster (Tage × Stunden).

### 3.2 Planungsphase – Lehrerdeputate

1. **Zuordnungs-UI (Drag & Drop)**
   - Dreispaltiges Layout: linke Lehrkräfte-Liste (Suchfeld, Sortierung, Kapazitätsfilter, Badges); mittlerer Bereich mit Klassenkarten und Fach-Pills; rechte Detailleiste für ausgewählte Lehrkraft (Qualifikationen, Stundenübersicht).
   - Palette der Fächer mit Stundenumfang pro Klasse/Klassenstufe (Pills mit Reststunden, Farbkodierung nach Fach).
   - Lehrer-Karten mit Deputats-Soll / Ist Anzeige, Badge, Progress-Indicator und Drag & Drop-Zielzone.
   - Drag & Drop von Fach-Stunden auf Lehrkräfte.
   - Automatische Aktualisierung der verbleibenden Deputatsstunden.
   - Manuelle Anpassungen (z. B. Rücknahme, Mehrfach-Zuweisungen).

2. **Versionierung**
   - Zuordnungsvarianten als „Lehrauftrags-Versionen“ speicherbar (Name, Kommentar).
   - Laden, Kopieren, Löschen von Varianten.
   - Export/Import (JSON) optional im Backup-Modul.

### 3.3 Basisplan-Erstellung

1. **Schritt 1 – Unterrichtszeiten pro Klasse**
   - Kompaktes Tagesraster (Mo–Fr × Stunden).
   - Togglen von Unterrichtszeiten pro Klasse.
   - Kopierfunktion auf andere Klassen.

2. **Schritt 2 – Raumverfügbarkeit**
   - Raster je Raum analog Schritt 1.
   - CRUD für Räume.

3. **Schritt 3 – Fixierte Stunden**
   - Wiederverwendbare „ScheduleGrid“-Komponente (siehe Abschnitt 4).
   - Drag & Drop von Fach-Kacheln (Palette) in Slots.
   - Lock-Icon für fixierte Slots, Entfernen nur über definierte Aktion.
   - Nutzung der Fachfarbe, Tooltip mit Details (Fach, Lehrer, Raum).

4. **Schritt 4 – Zeitfenster (Soft Slots)**
   - Optional: Drag & Drop mit hell markierten Slots (weiche Restriktionen) **oder**
   - Alternativ: Verlagerung dieser Logik in Lehrkräfte-/Raumverfügbarkeiten. Entscheidung noch offen (Annahme aktuell: Verfügbarkeiten reichen aus, Soft Slots nicht erforderlich).

5. **Versionierung**
   - Basisplanstände speichern (Name, Kommentar).
   - Varianten laden/kopieren/löschen.

6. **Autosave**
   - Debounced Autosave nach Änderungen.
   - Manuelles Speichern (Button) bleibt verfügbar.

### 3.4 Solver & Planvarianten

1. **OR-Tools Integration**
   - Erstellung von Stundenplänen auf Basis der Requirements und Basisplanvorgaben.
   - Regeln (z. B. keine Hohlstunden, Raum-/Lehrer-Verfügbarkeiten, Doppelstunden-Constraints).
   - Erweiterte Regeln: Band-Lehrer-Ausnahmen, Lehrer-Arbeitstage, Präferenz für Einzelstunden bei „Doppelstunde kann“.

2. **Planversionen**
   - Ergebnisse (Plan + Metadaten) als Version speichern (Name, Kommentar).
   - Anzeige der Planvariante mit ScheduleGrid.
   - Vergleich / Favoritenmarkierung (optional).
   - Manuelle Nachbearbeitung: Drag & Drop im Raster, Zwischenablage, geprüfte Lehrerkollisionen, Highlight je Lehrkraft, Rückkehr zum Ursprungsplan.
   - Speichern der manuellen Änderungen via Slot-Override (`/plans/{id}/slots`).

### 3.5 Backups & Datenexport

1. **Backup Modul**
   - Vollständiger JSON-Export: Lehrer, Klassen, Fächer, Räume, Requirements, Basisplan, Planversionen.
   - Import mit optionalem Replace.
   - Fehlerfeedback (z. B. Validierungsfehler).

2. **Teil-Exporte (optional)**
   - Lehrauftragsvarianten, Basispläne, Planversionen einzeln exportieren/importieren.

## 4. UI/UX Anforderungen

1. **Modulare Komponenten**
- `ScheduleGrid` (kompakt, farbcodiert, Icons):
  - Tages-Leisten, Klassen-Unterspalten, Zeilen für Zeitblöcke.
  - Zustände: Fixed (🔒), Allowed (hell), Geplanter Unterricht (bunte Fachkachel).
  - Tooltips mit Volltext (Fach, Lehrer, Raum).
   - Hervorhebung einzelner Lehrkräfte (Filter), auch im Bearbeitungsmodus.
- `DragPalette` (Filter + Chips).
- `TeacherBadge` (wiederverwendbarer Badge mit Kürzel/Farbe, Tooltip & Detail-Dialog).
- Status-/Toastr-Komponente für Feedback.
- Tab-Navigation.

2. **Optik**
   - Tailwind/DaisyUI Basis.
   - Farbkonzept an Schulplan (siehe Referenzbild).
   - Responsive (Desktop-optimiert, aber auf Tablets brauchbar).
   - Grundlage für kompaktes Hauptlayout (Sticky-Navigation, Karten mit Box-Shadows).
   - Möglichst konsequente Nutzung von DaisyUI-Komponenten (Buttons, Tabs, Navbar, Tables etc.), eigene Styles nur ergänzend.

3. **Grundgerüst (aktueller Stand)**
   - Modul `NavBar` mit Hash-basiertem Routing (`#/plan`, `#/basisplan`, `#/datenpflege`, `#/einstellungen`).
   - Placeholder-Views zur schrittweisen Implementierung.
   - Einstieg `main.js` initialisiert Navigation und Router.
   - Styles in `style.css` für Basiskomponenten (Navigation, Content, Platzhalter).
   - Tailwind + DaisyUI derzeit via CDN eingebunden; perspektivisch in Build-Pipeline integrieren.
   - Einstellungen-View enthält Theme-Switcher (DaisyUI-Themes) inkl. Persistenz via `localStorage`.
   - Layout mit DaisyUI `drawer`: Responsive Sidebar (Planung/Verwaltung), Sticky Navbar mit Branding „KlassenTakt“, Avatar + Login/Logout Platzhalter.
   - App-Settings in der Navbar (Profilbereich), Hauptnavigation ausschließlich in der Sidebar (ohne Dopplungen).
   - Footer mit Links (Support, Datenschutz, Privacy Settings) und Branding „KlassenTakt“.

3. **Interaktion**
   - Drag & Drop via HTML5 oder Lib (z. B. dnd-kit).
   - Tastatur-Shortcuts optional (später).
   - Echtzeit-Statusanzeige (z. B. „Änderungen noch nicht gespeichert“, „automatisch gespeichert“).

4. **Performance**
   - Effiziente Render-Updates (z. B. virtualisierte Listen oder differenzierte DOM-Updates).
   - Lokaler Editor (Slots im Speicher) für verzögerungsfreies Drag & Drop.

## 5. Persistenz, Backend & API

### 5.1 Backend-Struktur (aktueller Stand)

- `backend/app/main.py` initialisiert FastAPI, registriert Router und seedet Standard-Regelprofile.
- `backend/app/models.py` beschreibt sämtliche SQLModel-Tabellen (Teachers, Subjects, Requirements, Plans, BasisPlan usw.).
- `backend/app/routers/` bündelt die REST-Endpunkte für Stammdaten, Basisplan- und Planverwaltung.
- `backend/app/services/solver_service.py` kapselt die OR-Tools-Anbindung (`solve_best_plan`).
- `stundenplan_regeln.py` definiert die konkreten Constraints und Objectives des Solvers.

### 5.2 Zentrale Datenmodelle

- **Subject** enthält neben Raum- und Default-Angaben Flags wie `is_bandfach`, `is_ag_foerder` sowie optional `alias_subject_id` (z. B. Leseband → Deutsch).
- **Requirement** nutzt `version_id` und `participation` (`curriculum`/`ag`), um Curriculum- und AG-Stunden nebeneinander abzubilden.
- **BasisPlan** speichert `windows`, `fixed` und `flexible` als JSON.  
  - `fixed`: feste Slot-Zuweisungen (pro Klasse/Slot → Fach erzwingen).  
  - `flexible`: optionale Slot-Gruppen für alternative Platzierungen eines Fachs.
- **Plan** hält Score, Status, `comment`, `version_id` sowie Snapshots (`rules_snapshot`, `rule_keys_active`, `params_used`) zur Nachvollziehbarkeit.

### 5.3 Planungs- und Solver-Workflow

1. **Analyse** (`GET /plans/analyze`): Aggregiert Requirements (optional per `version_id`), Klassen-/Lehrer-Stunden und markiert Problemfälle (z. B. Doppelstunden, Nachmittagsunterricht).
2. **Regel-Liste** (`GET /plans/rules`): Liefert die schaltbaren Bool-Parameter und Gewichtungen für das Frontend.
3. **Plan-Generierung** (`POST /plans/generate`): Lädt Requirements, Stammdaten und Basisplan, mappt `basisplan.data.fixed` und `basisplan.data.flexible` und übergibt alles an `solve_best_plan`. Erfolgreiche Runs persistieren Plan + Slots; Fehlschläge liefern `HTTP 422` mit `"Keine Lösung gefunden."`.
4. **Plan-Update** (`PUT /plans/{id}`): Benennt Pläne um oder ergänzt Kommentare.
5. **Plan-Slot-Update** (`PUT /plans/{id}/slots`): Überschreibt die Slotliste nach manuellen Anpassungen im Editor.
   - Der Plan-Editor berücksichtigt 0-/1-basige Slot-Indizes korrekt, sodass beim Bearbeiten alle Stunden erhalten bleiben.

### 5.4 Solver-spezifische Regeln

- Fixed Slots setzen harte Constraints (`== 1`) für `(fach, tag, stunde)`.
- Flexible Gruppen erzwingen `sum(slots) == 1` pro Fach/Gruppe.
- Klassen-Zeitfenster aus dem Basisplan sperren Slots (`basisplan_windows`), Pausen bleiben davon unberührt.
- Bandfächer werden parallel über Klassen gelegt; `band_lehrer_parallel` erlaubt parallelen Unterricht einer Lehrkraft.
- Alias-Fächer (via `alias_subject_id`) teilen sich Doppelstunden- und Tagesgrenzen.
- Lehrer-Arbeitstage (`lehrer_arbeitstage`) sperren Einsätze außerhalb hinterlegter Verfügbarkeiten.
- „Doppelstunde = kann“ favorisiert Einzelstunden über Soft-Objectives; „Doppelstunde = soll“ wurde ergänzt und bestraft fehlende Doppelblöcke weich.
- Weitere Regeln decken Tageslimits, Vormittags-/Nachmittagsgrenzen, Konfliktfreiheit und Soft-Ziele (`gleichverteilung`, Hohlstunden) ab.
- Flexible Options-Slots wirken jetzt ausschließlich pro Requirement; andere Fächer teilen sich diese Slots wieder, damit der Solver keine unbeabsichtigten Blockaden erzeugt.
- Optional teilnehmende Bandfächer werden über das neue Gewicht `W_BAND_OPTIONAL` bevorzugt eingeplant.
- Hohlstunden-Regeln berücksichtigen nur noch echte Unterrichtsslots (Pausen werden ignoriert); die „Nachmittag mit freier 6. Stunde“-Logik zählt ebenfalls die realen Unterrichtsblöcke.

### 5.5 API-Endpunkte & Erweiterungen

- **Aktuell verfügbar (Account-kontextsensitiv):** `/teachers`, `/classes`, `/subjects`, `/rooms`, `/requirements`, `/basisplan`, `/plans`, `/versions`, `/rule-profiles`. Jeder Endpunkt erwartet einen `account_id`-Kontext (Default: erster Account) und filtert sämtliche Lese-/Schreiboperationen darauf.
- **Export/Import-Status:** Setup-/Stundenverteilungs-/Basisplan-/Plan-Exporte sind umgesetzt (JSON). Account-Isolierung der Backups folgt in einer späteren Iteration.
- **Geplante/teilweise implementierte Erweiterungen:**
  - Lehrer-Verfügbarkeiten als Raster (Tage × Stunden).
  - Fächer-Stundenmatrix pro Klassenstufe (Validierung offen).
  - Optionales `windows`-Feld im Basisplan für Soft-Slots.
  - Account-spezifische Backup-/Import-Flows.

### 5.6 Autorisierung & Security

- Dev-Stand: statischer Default-Admin (`admin@example.com` / `admin`) für den ersten Account; Authentifizierung erfolgt aktuell nicht über OAuth.
- Datenmodell unterstützt Multi-Account (Owner/Planner/Viewer) via `Account`, `User`, `AccountUser`.
- Frontend-Login & Session-Handling stehen noch aus und werden in einer späteren Iteration umgesetzt.

### 5.7 Planungsperioden & Multiuser Roadmap

- Sämtliche Stammdaten- und Plan-Tabellen tragen `account_id`; der Default-Account wird beim Startup angelegt.
- Planungsperioden (`planning_period`) werden als nächster Schritt eingeführt (Perioden je Account, optional überlappend).
- Frontend erhält beim Einstieg eine Periode-Auswahl; sämtliche Views laden Daten ausschließlich für den aktiven Account/Periode-Kontext.

## 6. Versionierung & Deployment

1. **Git-Workflow**
   - Feature-Branches, Pull Requests, Reviews.
   - Commit-Historie strukturiert halten.

2. **Build/Deployment**
   - Frontend: Vite/Webpack Build → statische Assets.
   - Backend: FastAPI (uvicorn/gunicorn) + DB (SQLite in MVP, später Postgres).
   - Optional Docker-Setup.

## 7. Qualitätssicherung

1. **Tests**
   - Unit Tests für Services und Komponenten.
   - Integrationstests (Plan-Flow, Basisplan-Flow).
   - Solver-Testdaten (kleine Schulbeispiele).

2. **Dokumentation**
   - README mit Setup-Anleitung.
   - Komponenten-Dokumentation (Storybook o. ä. optional).
   - Change-Log.

3. **Usability-Checks**
   - Feedback-Schleifen mit Anwender*innen.
   - Iteratives Prototyping v. a. für Drag & Drop und ScheduleGrid.

## 8. Offene Punkte / ToDo

- Entscheidung zu Framework (React/Vue/Svelte) und Technologie-Stack.
- Detailliertes Datenmodell für Lehrer-Verfügbarkeiten und Stundenbedarfe.
- Solver-Anpassungen (Berücksichtigung neuer Constraints).
- Umsetzungsplan / Roadmap (Milestones).
- Account-spezifische Exporte/Importe fertigstellen (Setup, Stundenverteilung, Pläne, Basisplan).
- Authentifizierungs- & Session-Flow implementieren (Login, JWT/OAuth, Frontend-State).
- Planungsperioden-API (CRUD, Clone) sowie UI-Einstieg in neue Schuljahre bereitstellen.
- Frontend: globale Account-/Perioden-Auswahl, Weitergabe von `account_id` an alle Requests.

**Bekannte Einschränkungen & Ideen (aktueller Dev-Stand):**

| Thema | Beschreibung | Idee/Next Steps |
|-------|--------------|-----------------|
| Fehlerfeedback Solver | Bei 422 („Keine Lösung gefunden.“) gibt es nur Status/Console-Ausgabe. | Im Plan-View eine sichtbare Info einblenden (mit Link zum Analyse-Tab oder Troubleshooting-Hinweisen). |
| Analyse-Aktualisierung | Analyse aktualisiert sich nicht bei Regel-/Paramänderungen. | Optional automatische Aktualisierung, sobald Overrides die Stundenverteilung beeinflussen. |
| Basisplan > Plan Sync | Keine Validierung against Curriculum bei Optionen. | Warnsystem ergänzen, bevor Solver läuft. |
| Regelübersicht | Badge zeigt „Overrides“/„Params“, aber keine Details. | Tooltips oder Liste der abweichenden Keys integrieren. |
| Persistenz Param/Rule Overrides | Aktuell In-Memory; kein Save über Reload hinaus. | Persistente Speicherung pro Version/Profil. |
| Fehlendes Favicon | Browser 404 auf `favicon.ico`. | Datei nachlegen oder Link entfernen. |
| Multiuser Backups | `backup/*`-Routen exportieren/importieren noch global. | Account-Filter ergänzen, UI anpassen. |
| Frontend Auth | Noch kein Login-/Session-Handling. | Minimalen Auth-Flow ergänzen, spätere OAuth-Integration berücksichtigen. |

**Nächste Schritte / Übergabe-Hinweise:**

1. Solver-Fehler analysieren: Analyse-Tab und Basisplan prüfen, Regeln/Parameter feinjustieren (`max_attempts`, `time_per_attempt`).
2. UX verbessern: Fehlerhinweis für „Keine Lösung gefunden.“ prominent im UI platzieren und Troubleshooting-Panel verlinken.
3. Param-/Regel-Defaults: Pro Version/Profil klare Defaults setzen (`DEFAULT_PARAMS` + Profil-Regeln).
4. Dokumentation vertiefen: Basisplan-Datenformat (`data.fixed`/`data.flexible`) für externe Tools dokumentieren.
5. Optional persistente Speicherung von Solver-Parametern je Planprofil / API für zuletzt genutzte Parameter schaffen.
6. Account-/Perioden-Auswahl im Frontend implementieren und an alle Requests durchreichen.
7. Planungsperioden-CRUD & Clone-Workflow fertigstellen, inklusive Migration bestehender Daten.

---

**Hinweis:** Dieses Lastenheft basiert auf dem aktuellen Chatverlauf (September 2025). Erweiterungen/Änderungen werden gemeinsam versioniert und abgestimmt.
