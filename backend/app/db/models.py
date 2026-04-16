from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class CaseRecord(Base):
    __tablename__ = "cases"
    __table_args__ = (
        CheckConstraint("NOT (user_id IS NOT NULL AND guest_id IS NOT NULL)", name="ck_cases_not_both_owners"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    guest_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False)

    user: Mapped["UserRecord | None"] = relationship(back_populates="cases")
    upload_sessions: Mapped[list["UploadSessionRecord"]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="UploadSessionRecord.uploaded_at",
    )
    shared_links: Mapped[list["SharedCaseRecord"]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="SharedCaseRecord.created_at",
    )


class UploadSessionRecord(Base):
    __tablename__ = "upload_sessions"
    __table_args__ = (
        CheckConstraint(
            "NOT (user_id IS NOT NULL AND guest_id IS NOT NULL)",
            name="ck_upload_sessions_not_both_owners",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    guest_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="upload")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False, index=True)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_response_json: Mapped[dict] = mapped_column(JSON, nullable=False)

    user: Mapped["UserRecord | None"] = relationship(back_populates="upload_sessions")
    case: Mapped[CaseRecord] = relationship(back_populates="upload_sessions")


class GeoCacheRecord(Base):
    __tablename__ = "geo_cache"

    ip: Mapped[str] = mapped_column(String(64), primary_key=True)
    country: Mapped[str | None] = mapped_column(String(128), nullable=True)
    lat: Mapped[float | None] = mapped_column(nullable=True)
    lon: Mapped[float | None] = mapped_column(nullable=True)
    provider: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False)


class UserRecord(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False)

    cases: Mapped[list[CaseRecord]] = relationship(back_populates="user")
    upload_sessions: Mapped[list[UploadSessionRecord]] = relationship(back_populates="user")
    api_keys: Mapped[list["APIKeyRecord"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="APIKeyRecord.created_at",
    )


class GuestUsageRecord(Base):
    __tablename__ = "guest_usage"

    guest_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False)


class SharedCaseRecord(Base):
    __tablename__ = "shared_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    case: Mapped[CaseRecord] = relationship(back_populates="shared_links")


class APIKeyRecord(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    hashed_key: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    user: Mapped[UserRecord] = relationship(back_populates="api_keys")
