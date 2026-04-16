"""initial persistence

Revision ID: 20260413_000001
Revises:
Create Date: 2026-04-13 00:00:01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260413_000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "geo_cache",
        sa.Column("ip", sa.String(length=64), nullable=False),
        sa.Column("country", sa.String(length=128), nullable=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lon", sa.Float(), nullable=True),
        sa.Column("provider", sa.String(length=128), nullable=True),
        sa.Column("last_status", sa.String(length=64), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("ip"),
    )

    op.create_table(
        "upload_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("risk_score", sa.Integer(), nullable=False),
        sa.Column("raw_response_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_upload_sessions_case_id"), "upload_sessions", ["case_id"], unique=False)
    op.create_index(op.f("ix_upload_sessions_uploaded_at"), "upload_sessions", ["uploaded_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_upload_sessions_uploaded_at"), table_name="upload_sessions")
    op.drop_index(op.f("ix_upload_sessions_case_id"), table_name="upload_sessions")
    op.drop_table("upload_sessions")
    op.drop_table("geo_cache")
    op.drop_table("cases")
