"""add band metadata to subject

Revision ID: 20251010_07_subject_band_fields
Revises: 20251009_06_subject_room_requirement
Create Date: 2025-10-10
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251010_07_subject_band_fields'
down_revision = '20251009_06_subject_room_requirement'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # clean up from previous failed attempts (SQLite keeps temp table)
    op.execute("DROP TABLE IF EXISTS _alembic_tmp_subject")

    with op.batch_alter_table('subject', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'is_bandfach',
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )
        batch_op.add_column(
            sa.Column(
                'band_group',
                sa.String(length=255),
                nullable=True,
            )
        )
        batch_op.create_index(
            'ix_subject_band_group',
            ['band_group'],
            unique=False,
        )

    op.execute("UPDATE subject SET is_bandfach = 0 WHERE is_bandfach IS NULL")

    with op.batch_alter_table('subject', schema=None) as batch_op:
        batch_op.alter_column(
            'is_bandfach',
            server_default=None,
            existing_type=sa.Boolean(),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('subject', schema=None) as batch_op:
        batch_op.drop_index('ix_subject_band_group')
        batch_op.drop_column('band_group')
        batch_op.drop_column('is_bandfach')
