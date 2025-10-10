"""initial schema incl. curriculum and fields

Revision ID: 20250915_01
Revises: 
Create Date: 2025-09-15

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250915_01'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    def ensure_table_teacher():
        if 'teacher' in inspector.get_table_names():
            return
        op.create_table(
            'teacher',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(), nullable=False, unique=True),
            sa.Column('kuerzel', sa.String(), nullable=True),
            sa.Column('deputat_soll', sa.Integer(), nullable=True),
        )

    def ensure_table_class():
        if 'class' in inspector.get_table_names():
            return
        op.create_table(
            'class',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(), nullable=False, unique=True),
        )

    def ensure_table_subject():
        if 'subject' in inspector.get_table_names():
            return
        op.create_table(
            'subject',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(), nullable=False, unique=True),
            sa.Column('kuerzel', sa.String(), nullable=True),
        )

    def ensure_table_ruleprofile():
        if 'ruleprofile' in inspector.get_table_names():
            return
        op.create_table(
            'ruleprofile',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(), nullable=False, unique=True),
            sa.Column('stundenbegrenzung', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('keine_hohlstunden', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('keine_hohlstunden_hard', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('nachmittag_regel', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('klassenlehrerstunde_fix', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('doppelstundenregel', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('einzelstunde_nur_rand', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('leseband_parallel', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('kuba_parallel', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('gleichverteilung', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('mittagsschule_vormittag', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('W_GAPS_START', sa.Integer(), nullable=False, server_default='2'),
            sa.Column('W_GAPS_INSIDE', sa.Integer(), nullable=False, server_default='3'),
            sa.Column('W_EVEN_DIST', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('W_EINZEL_KANN', sa.Integer(), nullable=False, server_default='5'),
        )

    def ensure_table_plan():
        if 'plan' in inspector.get_table_names():
            return
        op.create_table(
            'plan',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('rule_profile_id', sa.Integer(), sa.ForeignKey('ruleprofile.id'), nullable=True),
            sa.Column('seed', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(), nullable=False, server_default='PENDING'),
            sa.Column('score', sa.Float(), nullable=True),
            sa.Column('objective_value', sa.Float(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('is_favorite', sa.Boolean(), nullable=False, server_default=sa.text('0')),
        )

    def ensure_table_requirement():
        if 'requirement' in inspector.get_table_names():
            return
        op.create_table(
            'requirement',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('class_id', sa.Integer(), sa.ForeignKey('class.id'), nullable=False),
            sa.Column('subject_id', sa.Integer(), sa.ForeignKey('subject.id'), nullable=False),
            sa.Column('teacher_id', sa.Integer(), sa.ForeignKey('teacher.id'), nullable=False),
            sa.Column('wochenstunden', sa.Integer(), nullable=False),
            sa.Column('doppelstunde', sa.String(), nullable=False, server_default='kann'),
            sa.Column('nachmittag', sa.String(), nullable=False, server_default='kann'),
        )

    def ensure_table_planslot():
        if 'planslot' in inspector.get_table_names():
            return
        op.create_table(
            'planslot',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('plan_id', sa.Integer(), sa.ForeignKey('plan.id'), nullable=False),
            sa.Column('class_id', sa.Integer(), sa.ForeignKey('class.id'), nullable=False),
            sa.Column('tag', sa.String(), nullable=False),
            sa.Column('stunde', sa.Integer(), nullable=False),
            sa.Column('subject_id', sa.Integer(), sa.ForeignKey('subject.id'), nullable=False),
            sa.Column('teacher_id', sa.Integer(), sa.ForeignKey('teacher.id'), nullable=False),
        )

    def ensure_table_classsubject():
        if 'classsubject' in inspector.get_table_names():
            return
        op.create_table(
            'classsubject',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('class_id', sa.Integer(), sa.ForeignKey('class.id'), nullable=False),
            sa.Column('subject_id', sa.Integer(), sa.ForeignKey('subject.id'), nullable=False),
            sa.Column('wochenstunden', sa.Integer(), nullable=False),
        )

    # Create base tables in dependency order
    ensure_table_teacher()
    ensure_table_class()
    ensure_table_subject()
    ensure_table_ruleprofile()
    ensure_table_plan()
    ensure_table_requirement()
    ensure_table_planslot()
    ensure_table_classsubject()


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_table('classsubject')
    op.drop_table('planslot')
    op.drop_table('requirement')
    op.drop_table('plan')
    op.drop_table('ruleprofile')
    op.drop_table('subject')
    op.drop_table('class')
    op.drop_table('teacher')
