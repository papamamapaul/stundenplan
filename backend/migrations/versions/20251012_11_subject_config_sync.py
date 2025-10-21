"""subject curriculum config sync

Revision ID: 20251012_11_subject_config_sync
Revises: 20251010_10_plan_metadata
Create Date: 2025-10-12
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251012_11_subject_config_sync'
down_revision = '20251010_10_plan_metadata'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('classsubject', schema=None) as batch_op:
        batch_op.add_column(sa.Column('doppelstunde', sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column('nachmittag', sa.String(length=16), nullable=True))

    with op.batch_alter_table('requirement', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('config_source', sa.String(length=32), nullable=False, server_default='subject')
        )

    op.execute("UPDATE requirement SET config_source = 'subject' WHERE config_source IS NULL")

    with op.batch_alter_table('requirement', schema=None) as batch_op:
        batch_op.alter_column('config_source', server_default=None)


def downgrade() -> None:
    with op.batch_alter_table('requirement', schema=None) as batch_op:
        batch_op.drop_column('config_source')

    with op.batch_alter_table('classsubject', schema=None) as batch_op:
        batch_op.drop_column('nachmittag')
        batch_op.drop_column('doppelstunde')
