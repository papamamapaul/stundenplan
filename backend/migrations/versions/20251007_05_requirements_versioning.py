"""add distribution versions and version_id on requirement

Revision ID: 20251007_05_requirements_versioning
Revises: 20251007_04_subject_defaults
Create Date: 2025-10-07
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20251007_05_requirements_versioning"
down_revision = "20251007_04_subject_defaults"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.create_table(
            "distributionversion",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=255), nullable=False, unique=True),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    except Exception:
        pass
    try:
        op.add_column("requirement", sa.Column("version_id", sa.Integer(), nullable=True))
    except Exception:
        pass
    try:
        op.create_foreign_key(
            "fk_requirement_version",
            "requirement",
            "distributionversion",
            ["version_id"],
            ["id"],
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_constraint("fk_requirement_version", "requirement", type_="foreignkey")
    except Exception:
        pass
    try:
        op.drop_column("requirement", "version_id")
    except Exception:
        pass
    try:
        op.drop_table("distributionversion")
    except Exception:
        pass
