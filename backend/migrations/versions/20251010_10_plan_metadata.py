"""add comment and version to plan

Revision ID: 20251010_10_plan_metadata
Revises: 20251010_09_subject_ag_foerder
Create Date: 2025-10-10
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251010_10_plan_metadata'
down_revision = '20251010_09_subject_ag_foerder'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('plan', schema=None) as batch_op:
        batch_op.add_column(sa.Column('comment', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('version_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_plan_version',
            'distributionversion',
            ['version_id'],
            ['id'],
        )


def downgrade() -> None:
    with op.batch_alter_table('plan', schema=None) as batch_op:
        batch_op.drop_constraint('fk_plan_version', type_='foreignkey')
        batch_op.drop_column('version_id')
        batch_op.drop_column('comment')
