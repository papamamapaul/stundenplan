from typing import Iterator

from sqlmodel import SQLModel, Session, create_engine


# SQLite-Datei im Projektverzeichnis (einfach für lokalen Start)
DATABASE_URL = "sqlite:///./backend.db"

engine = create_engine(
    DATABASE_URL,
    echo=False,  # Für Debugging auf True setzen
)


def create_db_and_tables() -> None:
    from . import models  # noqa: F401 — stellt sicher, dass Tabellen registriert sind
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session

