# Stundenplan-Tool

Dieses Repository enthält einen leichtgewichtigen Prototypen für ein webbasiertes Stundenplansystem auf Basis von FastAPI/SQLModel und einer statischen Frontend-UI mit Vanilla JS sowie DaisyUI/Tailwind.  
Alle fachlichen Anforderungen, Architektur- und UX-Vorgaben sind im `Lastenheft.md` dokumentiert; dieses README konzentriert sich ausschließlich auf Setup und täglichen Entwicklungsablauf.

---

## Voraussetzungen

- Python 3.11 oder neuer
- `pip` sowie optional `python -m venv` für eine isolierte Umgebung
- SQLite (wird mit der Python-Standardbibliothek ausgeliefert)

---

## Schnellstart

```bash
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Development-Server starten (Frontend wird als StaticFiles unter /ui ausgeliefert)
uvicorn backend.app.main:app --reload
```

- API: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:8000/ui/index.html`
- Standard-Datenbank: `backend.db` (SQLite, verwaltet über SQLModel/Alembic)

---

## Entwicklungs-Workflow

- Das Frontend wird statisch aus dem Backend ausgeliefert; ein eigener Build-Step ist derzeit nicht erforderlich.
- Während `uvicorn` mit `--reload` läuft, greifen Backend-Änderungen unmittelbar. Für UI-Anpassungen reicht ein Browser-Reload.
- Log-Ausgaben erscheinen in der Konsole; optional können sie zusätzlich in `uvicorn.log` mitgeschrieben werden.

---

## Datenbank & Backups

- Die SQLite-Datei `backend.db` liegt im Repository-Wurzelverzeichnis. Backups (`backend.db.bak_<timestamp>`) lassen sich bei Bedarf zurückspielen oder archivieren.
- Alembic-Konfiguration: `alembic.ini`. Migrationen werden unter `backend/app/migrations/` gehalten (aktuelles Minimal-Setup).
- Für einen Reset genügt es, den Server zu stoppen und eine frische Datenbankdatei bereitzustellen.

---

## Tests & Linting

- Automatisierte Tests sind bislang nicht eingerichtet. Für lokale Experimente kann `pytest` ergänzt und innerhalb der virtuellen Umgebung ausgeführt werden.
- Code-Formatierung orientiert sich an den üblichen Python-Standards (`black`, `ruff` o. Ä.). Eigene Tooling-Anpassungen bitte im Lastenheft oder Projekt-Wiki dokumentieren.

---

## Weitere Hinweise

- Solver-Parameter, UI-Flows und fachliche Regeln sind detailliert in `Lastenheft.md` beschrieben (siehe insbesondere Abschnitt 5).
- Änderungen an Anforderungen, UX oder Datenmodell sollten zuerst im Lastenheft festgehalten und anschließend im Code umgesetzt werden.
- Wochenstunden, Doppelstunden-Modus und Nachmittagsregeln werden zentral unter `Datenpflege > Fächer` pro Klasse gepflegt; der Solver übernimmt die Werte automatisch.
- Selektive JSON-Exporte/-Importe findest du unter `Import / Export` (Setup, Stundenverteilungen, Basisplan, berechnete Pläne).
