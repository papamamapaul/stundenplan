from __future__ import annotations

from pathlib import Path
from typing import List

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from ..models import Class, ClassSubject, Subject

router = APIRouter(prefix="/excel", tags=["excel"])


@router.get("/requirements")
def excel_requirements(path: str = Query("stundenverteilung.xlsx")) -> List[dict]:
    p = Path(path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Excel nicht gefunden: {p}")
    df = pd.read_excel(p)
    needed = {"Fach", "Klasse", "Lehrer", "Wochenstunden"}
    if not needed.issubset(set(df.columns)):
        raise HTTPException(status_code=400, detail="Fehlende Spalten in Excel.")

    if "Doppelstunde" not in df.columns:
        df["Doppelstunde"] = "kann"
    if "Nachmittag" not in df.columns:
        df["Nachmittag"] = "kann"
    df["Doppelstunde"] = df["Doppelstunde"].astype(str).str.strip().str.lower()
    df["Nachmittag"] = df["Nachmittag"].astype(str).str.strip().str.lower()

    # Liefere Rohzeilen zurück (für Stundentafeln-Ansicht)
    rows = df[[
        "Fach", "Klasse", "Lehrer", "Wochenstunden", "Doppelstunde", "Nachmittag"
    ]].fillna("").to_dict(orient="records")
    return rows


@router.post("/import-curriculum")
def import_curriculum_from_excel(
    path: str = Query("stundenverteilung.xlsx"),
    replace: bool = Query(True, description="Bestehende Einträge ersetzen (truncate)")
    ,
    session: Session = Depends(get_session),
):
    """Liest die Excel und schreibt Stundentafel (ClassSubject) in die DB.
    Aggregiert pro Klasse+Fach die Wochenstunden (sum).
    """
    p = Path(path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Excel nicht gefunden: {p}")
    df = pd.read_excel(p)
    needed = {"Fach", "Klasse", "Lehrer", "Wochenstunden"}
    if not needed.issubset(set(df.columns)):
        raise HTTPException(status_code=400, detail="Fehlende Spalten in Excel.")

    # Gruppieren auf Stundentafel-Niveau
    g = df.groupby([df["Klasse"].astype(str).str.strip(), df["Fach"].astype(str).str.strip()])["Wochenstunden"].sum()
    pairs = g.reset_index().rename(columns={"Klasse": "klasse", "Fach": "fach", "Wochenstunden": "wochenstunden"})

    if replace:
        # truncate table
        session.exec(select(ClassSubject))  # ensure mapping
        session.query(ClassSubject).delete()
        session.commit()

    created = 0
    for _, row in pairs.iterrows():
        klasse = str(row["klasse"]).strip()
        fach = str(row["fach"]).strip()
        ws = int(row["wochenstunden"]) if pd.notnull(row["wochenstunden"]) else 0

        # ensure class & subject exist
        cls = session.exec(select(Class).where(Class.name == klasse)).first()
        if not cls:
            cls = Class(name=klasse)
            session.add(cls)
            session.commit(); session.refresh(cls)

        subj = session.exec(select(Subject).where(Subject.name == fach)).first()
        if not subj:
            subj = Subject(name=fach)
            session.add(subj)
            session.commit(); session.refresh(subj)

        cs = ClassSubject(class_id=cls.id, subject_id=subj.id, wochenstunden=ws)
        session.add(cs)
        created += 1

    session.commit()
    return {"ok": True, "inserted": created}
