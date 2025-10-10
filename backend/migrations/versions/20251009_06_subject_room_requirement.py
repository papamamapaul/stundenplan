"""add required_room_id to subject

Revision ID: 20251009_06_subject_room_requirement
Revises: 20251007_05_requirements_versioning
Create Date: 2025-10-09
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251009_06_subject_room_requirement'
down_revision = '20251007_05_requirements_versioning'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('subject', schema=None) as batch_op:
        batch_op.add_column(sa.Column('required_room_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_subject_required_room', 'room', ['required_room_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('subject', schema=None) as batch_op:
        batch_op.drop_constraint('fk_subject_required_room', type_='foreignkey')
        batch_op.drop_column('required_room_id')
