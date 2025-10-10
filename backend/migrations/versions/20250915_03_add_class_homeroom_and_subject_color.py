"""add class.homeroom_teacher_id and subject.color

Revision ID: 20250915_03
Revises: 20250915_02
Create Date: 2025-09-15

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250915_03'
down_revision = '20250915_02'
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.add_column('class', sa.Column('homeroom_teacher_id', sa.Integer(), nullable=True))
    except Exception:
        pass
    try:
        op.add_column('subject', sa.Column('color', sa.String(), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_column('subject', 'color')
    except Exception:
        pass
    try:
        op.drop_column('class', 'homeroom_teacher_id')
    except Exception:
        pass
