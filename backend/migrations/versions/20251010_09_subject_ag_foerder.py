"""add is_ag_foerder to subject

Revision ID: 20251010_09_subject_ag_foerder
Revises: 20251010_08_remove_subject_band_group
Create Date: 2025-10-10
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251010_09_subject_ag_foerder'
down_revision = '20251010_08_remove_subject_band_group'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('subject', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'is_ag_foerder',
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )
    op.execute("UPDATE subject SET is_ag_foerder = 0 WHERE is_ag_foerder IS NULL")
    with op.batch_alter_table('subject', schema=None) as batch_op:
        batch_op.alter_column(
            'is_ag_foerder',
            server_default=None,
            existing_type=sa.Boolean(),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('subject', schema=None) as batch_op:
        batch_op.drop_column('is_ag_foerder')
