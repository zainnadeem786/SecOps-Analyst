"""api keys and source type support

Revision ID: 20260415_000003
Revises: 20260414_000002
Create Date: 2026-04-15 00:00:03
"""

from alembic import op
import sqlalchemy as sa


revision = "20260415_000003"
down_revision = "20260414_000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "upload_sessions",
        sa.Column("source_type", sa.String(length=32), nullable=False, server_default="upload"),
    )

    op.create_table(
        "api_keys",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("hashed_key", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_api_keys_user_id"), "api_keys", ["user_id"], unique=False)
    op.create_index(op.f("ix_api_keys_hashed_key"), "api_keys", ["hashed_key"], unique=True)
    op.create_index(op.f("ix_api_keys_revoked_at"), "api_keys", ["revoked_at"], unique=False)

    op.alter_column("upload_sessions", "source_type", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_api_keys_revoked_at"), table_name="api_keys")
    op.drop_index(op.f("ix_api_keys_hashed_key"), table_name="api_keys")
    op.drop_index(op.f("ix_api_keys_user_id"), table_name="api_keys")
    op.drop_table("api_keys")
    op.drop_column("upload_sessions", "source_type")
