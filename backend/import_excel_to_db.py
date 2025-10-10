from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
from sqlmodel import Session, select

from app.database import engine, create_db_and_tables
from app.models import (
    Class,
    DoppelstundeEnum,
    Requirement,
    Subject,
    Teacher,
    NachmittagEnum,
)


def get_or_create_by_name(session: Session, model, name: str):
    row = session.exec(select(model).where(model.name == name)).first()
    if row:
        return row
    row = model(name=name)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def main(path: str = "stundenverteilung.xlsx") -> None:
    xls = Path(path)
    if not xls.exists():
        print(f"Excel nicht gefunden: {xls.resolve()}")
        sys.exit(1)

    df = pd.read_excel(xls)
    needed = {"Fach", "Klasse", "Lehrer", "Wochenstunden"}
    if not needed.issubset(set(df.columns)):
        print("Fehlende Spalten. Erwartet: 'Fach', 'Klasse', 'Lehrer', 'Wochenstunden'")
        sys.exit(2)

    # Normalisieren wie in Streamlit
    if "Doppelstunde" not in df.columns:
        df["Doppelstunde"] = "kann"
    if "Nachmittag" not in df.columns:
        df["Nachmittag"] = "kann"
    df["Doppelstunde"] = df["Doppelstunde"].astype(str).str.strip().str.lower()
    df["Nachmittag"] = df["Nachmittag"].astype(str).str.strip().str.lower()

    create_db_and_tables()
    with Session(engine) as session:
        for _, row in df.iterrows():
            fach = str(row["Fach"]).strip()
            klasse = str(row["Klasse"]).strip()
            lehrer = str(row["Lehrer"]).strip()
            ws = int(row["Wochenstunden"]) if not pd.isna(row["Wochenstunden"]) else 0
            ds = str(row.get("Doppelstunde", "kann")).strip().lower()
            nm = str(row.get("Nachmittag", "kann")).strip().lower()

            subj = get_or_create_by_name(session, Subject, fach)
            cls = get_or_create_by_name(session, Class, klasse)
            tch = get_or_create_by_name(session, Teacher, lehrer)

            req = Requirement(
                class_id=cls.id,
                subject_id=subj.id,
                teacher_id=tch.id,
                wochenstunden=ws,
                doppelstunde=DoppelstundeEnum(ds if ds in DoppelstundeEnum.__members__ else "kann"),
                nachmittag=NachmittagEnum(nm if nm in NachmittagEnum.__members__ else "kann"),
            )
            session.add(req)
        session.commit()
    print("Import fertig.")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "stundenverteilung.xlsx"
    main(path)

