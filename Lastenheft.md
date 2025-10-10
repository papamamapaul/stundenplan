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
   - Pflichtanwesenheiten (z. B. Konferenzen) und Reservierungen (optional).
   - UI: Tabellenbasierte Pflege mit Inline-Editing (Blur → sofortiges Speichern), letzte Zeile als Eingabezeile für neue Einträge.

3. **Fächer**
   - Fachname, Kürzel, Farbe (wird überall konsistent genutzt).
  - Doppelstunden-Regeln (muss/kann/darf nicht).
  - Pflicht-Raum (z. B. Schwimmhalle).
  - Stundenbedarf pro Klassenstufe (Matrix Klasse × Stunden).

4. **Räume**
   - Raumname, Typ, Kapazität, Klassenraum-Flag.
   - Verfügbarkeitsraster (Tage × Stunden).

### 3.2 Planungsphase – Lehrerdeputate

1. **Zuordnungs-UI (Drag & Drop)**
   - Palette der Fächer mit Stundenumfang pro Klasse/Klassenstufe.
   - Lehrer-Karten mit Deputats-Soll / Ist Anzeige.
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

2. **Planversionen**
   - Ergebnisse (Plan + Metadaten) als Version speichern (Name, Kommentar).
   - Anzeige der Planvariante mit ScheduleGrid.
   - Vergleich / Favoritenmarkierung (optional).

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
   - `DragPalette` (Filter + Chips).
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

## 5. Persistenz & API

1. **Bestehende Endpoints**
   - `/teachers`, `/classes`, `/subjects`, `/rooms`, `/requirements`, `/basisplan`, `/plans`, `/versions`, `/backup`, etc.

2. **Erweiterungen**
   - Lehrer-Verfügbarkeiten (Tage/Stunden).
   - Fächer-Stundenmatrix pro Klassenstufe (bereits angelegt, validieren).
   - Basisplan: `windows` Feld (Soft-Slots) – evtl. optional.

3. **Autorisierung**
   - Für MVP keine Authentifizierung.
   - API-Schema so gestalten, dass spätere User/Gruppenmodellierung möglich bleibt (z. B. Owner-Id Feld reservieren).

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

---

**Hinweis:** Dieses Lastenheft basiert auf dem aktuellen Chatverlauf (September 2025). Erweiterungen/Änderungen werden gemeinsam versioniert und abgestimmt.
