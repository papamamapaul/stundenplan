"""introduce multi-tenant accounts

Revision ID: 20251012_12_multiuser_accounts
Revises: 20251012_11_subject_config_sync
Create Date: 2025-10-12
"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251012_12_multiuser_accounts'
down_revision = '20251012_11_subject_config_sync'
branch_labels = None
depends_on = None


TABLES_WITH_ACCOUNT = [
    'teacher',
    'class',
    'subject',
    'room',
    'classsubject',
    'requirement',
    'ruleprofile',
    'distributionversion',
    'basisplan',
    'plan',
    'planslot',
]

UNIQUE_NAME_INDEXES = {
    'teacher': 'ix_teacher_name',
    'class': 'ix_class_name',
    'subject': 'ix_subject_name',
    'room': 'ix_room_name',
    'ruleprofile': 'ix_ruleprofile_name',
    'distributionversion': 'ix_distributionversion_name',
}

UNIQUE_CONSTRAINTS = {
    'teacher': 'uq_teacher_account_name',
    'class': 'uq_class_account_name',
    'subject': 'uq_subject_account_name',
    'room': 'uq_room_account_name',
    'ruleprofile': 'uq_ruleprofile_account_name',
    'distributionversion': 'uq_distributionversion_account_name',
}


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)

    if not _table_exists(inspector, 'account'):
        op.create_table(
            'account',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index('ix_account_name', 'account', ['name'], unique=True)

    if not _table_exists(inspector, 'user'):
        op.create_table(
            'user',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('full_name', sa.String(length=255), nullable=True),
            sa.Column('password_hash', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column('is_superuser', sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index('ix_user_email', 'user', ['email'], unique=True)

    if not _table_exists(inspector, 'accountuser'):
        op.create_table(
            'accountuser',
            sa.Column('account_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('role', sa.String(length=32), nullable=False, server_default='owner'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(['account_id'], ['account.id']),
            sa.ForeignKeyConstraint(['user_id'], ['user.id']),
            sa.PrimaryKeyConstraint('account_id', 'user_id'),
        )

    account_id = connection.execute(
        sa.text("SELECT id FROM account WHERE name = :name"),
        {"name": "Default Account"},
    ).scalar()
    if not account_id:
        connection.execute(
            sa.text(
                "INSERT INTO account (name, description, created_at) VALUES (:name, :desc, :created)"
            ),
            {
                "name": "Default Account",
                "desc": "Automatisch angelegter Standard-Account",
                "created": datetime.now(timezone.utc),
            },
        )
        account_id = connection.execute(
            sa.text("SELECT id FROM account WHERE name = :name"),
            {"name": "Default Account"},
        ).scalar()

    user_id = connection.execute(
        sa.text("SELECT id FROM user WHERE email = :email"),
        {"email": "admin@example.com"},
    ).scalar()
    if not user_id:
        connection.execute(
            sa.text(
                "INSERT INTO user (email, full_name, password_hash, is_active, is_superuser, created_at) "
                "VALUES (:email, :full_name, :password_hash, :is_active, :is_superuser, :created)"
            ),
            {
                "email": "admin@example.com",
                "full_name": "Admin",
                "password_hash": "admin",
                "is_active": 1,
                "is_superuser": 1,
                "created": datetime.now(timezone.utc),
            },
        )
        user_id = connection.execute(
            sa.text("SELECT id FROM user WHERE email = :email"),
            {"email": "admin@example.com"},
        ).scalar()

    if account_id and user_id:
        link_exists = connection.execute(
            sa.text(
                "SELECT 1 FROM accountuser WHERE account_id = :account_id AND user_id = :user_id"
            ),
            {"account_id": account_id, "user_id": user_id},
        ).fetchone()
        if not link_exists:
            connection.execute(
                sa.text(
                    "INSERT INTO accountuser (account_id, user_id, role, created_at) "
                    "VALUES (:account_id, :user_id, :role, :created)"
                ),
                {
                    "account_id": account_id,
                    "user_id": user_id,
                    "role": "owner",
                    "created": datetime.now(timezone.utc),
                },
            )

    for table_name, index_name in UNIQUE_NAME_INDEXES.items():
        if _table_exists(inspector, table_name):
            existing_indexes = {idx["name"] for idx in inspector.get_indexes(table_name)}
            if index_name in existing_indexes:
                op.drop_index(index_name, table_name=table_name)

    for table in TABLES_WITH_ACCOUNT:
        if not _table_exists(inspector, table):
            continue
        op.add_column(table, sa.Column('account_id', sa.Integer(), nullable=True))
        connection.execute(
            sa.text(f"UPDATE {table} SET account_id = :account"),
            {"account": account_id or 1},
        )
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column('account_id', existing_type=sa.Integer(), nullable=False)
            batch_op.create_index(f'ix_{table}_account_id', ['account_id'])
            batch_op.create_foreign_key(f'fk_{table}_account', 'account', ['account_id'], ['id'])
            constraint_name = UNIQUE_CONSTRAINTS.get(table)
            if constraint_name:
                batch_op.create_unique_constraint(constraint_name, ['account_id', 'name'])


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)

    for table in reversed(TABLES_WITH_ACCOUNT):
        if not _table_exists(inspector, table):
            continue
        with op.batch_alter_table(table) as batch_op:
            constraint_name = UNIQUE_CONSTRAINTS.get(table)
            if constraint_name:
                batch_op.drop_constraint(constraint_name, type_='unique')
            batch_op.drop_constraint(f'fk_{table}_account', type_='foreignkey')
            batch_op.drop_index(f'ix_{table}_account_id')
        op.drop_column(table, 'account_id')

    for table_name, index_name in UNIQUE_NAME_INDEXES.items():
        if _table_exists(inspector, table_name):
            op.create_index(index_name, table_name, ['name'], unique=True)

    op.drop_table('accountuser')
    op.drop_index('ix_user_email', table_name='user')
    op.drop_table('user')
    op.drop_index('ix_account_name', table_name='account')
    op.drop_table('account')
