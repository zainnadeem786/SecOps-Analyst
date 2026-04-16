"""auth, guest usage, and sharing support

Revision ID: 20260414_000002
Revises: 20260413_000001
Create Date: 2026-04-14 00:00:02
"""

from alembic import op
import sqlalchemy as sa


revision = "20260414_000002"
down_revision = "20260413_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "guest_usage",
        sa.Column("guest_id", sa.String(length=128), nullable=False),
        sa.Column("usage_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("guest_id"),
    )

    op.create_table(
        "shared_cases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_shared_cases_case_id"), "shared_cases", ["case_id"], unique=False)
    op.create_index(op.f("ix_shared_cases_expires_at"), "shared_cases", ["expires_at"], unique=False)
    op.create_index(op.f("ix_shared_cases_token_hash"), "shared_cases", ["token_hash"], unique=True)

    op.add_column("cases", sa.Column("user_id", sa.String(length=36), nullable=True))
    op.add_column("cases", sa.Column("guest_id", sa.String(length=128), nullable=True))
    op.create_index(op.f("ix_cases_user_id"), "cases", ["user_id"], unique=False)
    op.create_index(op.f("ix_cases_guest_id"), "cases", ["guest_id"], unique=False)
    op.create_foreign_key("fk_cases_user_id_users", "cases", "users", ["user_id"], ["id"], ondelete="SET NULL")
    op.create_check_constraint("ck_cases_not_both_owners", "cases", "NOT (user_id IS NOT NULL AND guest_id IS NOT NULL)")

    op.add_column("upload_sessions", sa.Column("user_id", sa.String(length=36), nullable=True))
    op.add_column("upload_sessions", sa.Column("guest_id", sa.String(length=128), nullable=True))
    op.create_index(op.f("ix_upload_sessions_user_id"), "upload_sessions", ["user_id"], unique=False)
    op.create_index(op.f("ix_upload_sessions_guest_id"), "upload_sessions", ["guest_id"], unique=False)
    op.create_foreign_key("fk_upload_sessions_user_id_users", "upload_sessions", "users", ["user_id"], ["id"], ondelete="SET NULL")
    op.create_check_constraint(
        "ck_upload_sessions_not_both_owners",
        "upload_sessions",
        "NOT (user_id IS NOT NULL AND guest_id IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_upload_sessions_not_both_owners", "upload_sessions", type_="check")
    op.drop_constraint("fk_upload_sessions_user_id_users", "upload_sessions", type_="foreignkey")
    op.drop_index(op.f("ix_upload_sessions_guest_id"), table_name="upload_sessions")
    op.drop_index(op.f("ix_upload_sessions_user_id"), table_name="upload_sessions")
    op.drop_column("upload_sessions", "guest_id")
    op.drop_column("upload_sessions", "user_id")

    op.drop_constraint("ck_cases_not_both_owners", "cases", type_="check")
    op.drop_constraint("fk_cases_user_id_users", "cases", type_="foreignkey")
    op.drop_index(op.f("ix_cases_guest_id"), table_name="cases")
    op.drop_index(op.f("ix_cases_user_id"), table_name="cases")
    op.drop_column("cases", "guest_id")
    op.drop_column("cases", "user_id")

    op.drop_index(op.f("ix_shared_cases_token_hash"), table_name="shared_cases")
    op.drop_index(op.f("ix_shared_cases_expires_at"), table_name="shared_cases")
    op.drop_index(op.f("ix_shared_cases_case_id"), table_name="shared_cases")
    op.drop_table("shared_cases")
    op.drop_table("guest_usage")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
