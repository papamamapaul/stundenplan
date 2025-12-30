from typing import List, Optional

from sqlalchemy import text
from sqlmodel import Session, select

TAGE: List[str] = ["Mo", "Di", "Mi", "Do", "Fr"]

TEACHER_COLOR_PALETTE: List[str] = [
    "#2563EB",  # blue
    "#DC2626",  # red
    "#16A34A",  # green
    "#9333EA",  # purple
    "#F97316",  # orange
    "#0D9488",  # teal
    "#FACC15",  # yellow
    "#EC4899",  # pink
    "#14B8A6",  # cyan
    "#6366F1",  # indigo
    "#EF4444",  # bright red
    "#10B981",  # emerald
    "#F59E0B",  # amber
    "#8B5CF6",  # violet
    "#FB7185",  # rose
    "#0891B2",  # sky
    "#22C55E",  # lime
    "#7C3AED",  # deep violet
    "#F973AB",  # light pink
    "#1D4ED8",  # royal blue
]


def ensure_requirement_columns(session: Session) -> None:
    """Ensure legacy requirement tables have the latest optional columns."""
    info = session.exec(text("PRAGMA table_info(requirement)")).all()
    columns = {row[1] for row in info}
    missing = []
    if "participation" not in columns:
        missing.append("ALTER TABLE requirement ADD COLUMN participation TEXT DEFAULT 'curriculum'")
    if "planning_period_id" not in columns:
        missing.append("ALTER TABLE requirement ADD COLUMN planning_period_id INTEGER")
    if missing:
        for stmt in missing:
            session.exec(text(stmt))
        session.commit()


def ensure_teacher_color_column(session: Session) -> None:
    """Ensure teacher table includes the optional color column."""
    info = session.exec(text("PRAGMA table_info(teacher)")).all()
    columns = {row[1] for row in info}
    if "color" not in columns:
        session.exec(text("ALTER TABLE teacher ADD COLUMN color TEXT"))
        session.commit()


def normalize_hex_color(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    if value.startswith("#"):
        value = value[1:]
    if len(value) != 6:
        return None
    try:
        int(value, 16)
    except ValueError:
        return None
    return f"#{value.upper()}"


def next_teacher_color(session: Session, account_id: int) -> str:
    """Return the next available color for a teacher within an account."""
    from .models import Teacher  # local import to avoid circular dependency

    ensure_teacher_color_column(session)
    existing = session.exec(
        select(Teacher.color).where(Teacher.account_id == account_id)
    ).all()
    used = set()
    for row in existing:
        value = row[0] if isinstance(row, (tuple, list)) else getattr(row, "color", None)
        normalized = normalize_hex_color(value)
        if normalized:
            used.add(normalized)
    for color in TEACHER_COLOR_PALETTE:
        normalized = normalize_hex_color(color)
        if normalized not in used:
            return normalized or color

    # If all palette colours are used, generate a deterministic fallback
    offset = len(used)
    base = TEACHER_COLOR_PALETTE[offset % len(TEACHER_COLOR_PALETTE)]
    normalized_base = normalize_hex_color(base) or "#1F2937"
    if normalized_base not in used:
        return normalized_base

    # As a last resort, create a new colour by rotating hue algorithmically
    candidate = f"#{(37 * offset) % 256:02X}{(97 * offset) % 256:02X}{(173 * offset) % 256:02X}"
    return normalize_hex_color(candidate) or normalized_base
