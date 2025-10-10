"""add subject defaults for doppelstunde and nachmittag

Revision ID: 20251007_04_subject_defaults
Revises: 20250915_03
Create Date: 2025-10-07
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251007_04_subject_defaults'
down_revision = '20250915_03'
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.add_column('subject', sa.Column('default_doppelstunde', sa.String(length=16), nullable=True))
    except Exception:
        pass
    try:
        op.add_column('subject', sa.Column('default_nachmittag', sa.String(length=16), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_column('subject', 'default_nachmittag')
    except Exception:
        pass
    try:
        op.drop_column('subject', 'default_doppelstunde')
    except Exception:
        pass
