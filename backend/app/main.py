from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import create_db_and_tables
from .routers import (
    plans,
    masterdata,
    requirements,
    rule_profiles,
    excel_data,
    curriculum,
    backup,
    versions,
    auth,
    admin,
)
from .routers import rooms, basisplan, planning_periods, school


app = FastAPI(title="Stundenplan API", version="0.1.0")


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()
    # Seed default RuleProfile if none exists
    from sqlmodel import Session, select
    from .database import engine
    from .models import RuleProfile
    from .domain.accounts.service import (
        ensure_default_account,
        ensure_default_admin,
        ensure_default_planning_period,
    )

    with Session(engine) as session:
        account = ensure_default_account(session)
        ensure_default_admin(session, account)
        ensure_default_planning_period(session, account)
        existing = session.exec(select(RuleProfile).where(RuleProfile.account_id == account.id)).first()
        if not existing:
            default = RuleProfile(name="Default", account_id=account.id)
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
app.include_router(planning_periods.router)
app.include_router(school.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(admin.account_admin_router)

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
