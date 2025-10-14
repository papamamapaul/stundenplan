"""remove subject.band_group column

Revision ID: 20251010_08_remove_subject_band_group
Revises: 20251010_07_subject_band_fields
Create Date: 2025-10-10
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = '20251010_08_remove_subject_band_group'
down_revision = '20251010_07_subject_band_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_subject_band_group")
    with op.batch_alter_table('subject', schema=None) as batch_op:
        batch_op.drop_column('band_group')


def downgrade() -> None:
    raise RuntimeError("Downgrade not supported for removal of subject.band_group")
