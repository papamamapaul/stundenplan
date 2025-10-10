"""add teacher management fields

Revision ID: 20250915_02
Revises: 20250915_01
Create Date: 2025-09-15

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250915_02'
down_revision = '20250915_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.add_column('teacher', sa.Column('first_name', sa.String(), nullable=True))
    except Exception:
        pass
    try:
        op.add_column('teacher', sa.Column('last_name', sa.String(), nullable=True))
    except Exception:
        pass
    try:
        op.add_column('teacher', sa.Column('deputat', sa.Integer(), nullable=True))
    except Exception:
        pass
    for col in ['work_mo', 'work_di', 'work_mi', 'work_do', 'work_fr']:
        try:
            op.add_column('teacher', sa.Column(col, sa.Boolean(), nullable=False, server_default=sa.text('1')))
        except Exception:
            pass
    try:
        op.execute("UPDATE teacher SET work_mo=1, work_di=1, work_mi=1, work_do=1, work_fr=1 WHERE work_mo IS NULL")
    except Exception:
        pass


def downgrade() -> None:
    for col in ['work_fr','work_do','work_mi','work_di','work_mo','deputat','last_name','first_name']:
        try:
            op.drop_column('teacher', col)
        except Exception:
            pass
