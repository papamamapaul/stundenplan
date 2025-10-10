from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import create_db_and_tables
from .routers import plans, masterdata, requirements, rule_profiles, excel_data, curriculum, backup, versions
from .routers import rooms, basisplan


app = FastAPI(title="Stundenplan API", version="0.1.0")


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()
    # Seed default RuleProfile if none exists
    from sqlmodel import Session, select
    from .database import engine
    from .models import RuleProfile

    with Session(engine) as session:
        existing = session.exec(select(RuleProfile)).first()
        if not existing:
            default = RuleProfile(name="Default")
            session.add(default)
            session.commit()


@app.get("/")
def root():
    return {"ok": True, "service": "stundenplan", "routes": ["/plans/generate"]}


app.include_router(plans.router)
app.include_router(masterdata.router)
app.include_router(requirements.router)
app.include_router(rule_profiles.router)
app.include_router(excel_data.router)
app.include_router(curriculum.router)
app.include_router(backup.router)
app.include_router(versions.router)
app.include_router(rooms.router)
app.include_router(basisplan.router)

# Dev CORS: erlaubt alles für lokale Tests / statische Seite
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Statische Frontend-Dateien bereitstellen
app.mount("/ui", StaticFiles(directory="frontend", html=True), name="ui")
