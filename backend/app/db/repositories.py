from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import APIKeyRecord, CaseRecord, GeoCacheRecord, GuestUsageRecord, SharedCaseRecord, UploadSessionRecord, UserRecord
from app.models.log_model import (
    APIKeySummary,
    AuthResponse,
    CaseDetail,
    CaseReference,
    CaseSummary,
    GeoLocation,
    RepeatedAttacker,
    RiskTrendPoint,
    SessionReference,
    ShareCaseResponse,
    SharedCaseView,
    UserSummary,
    UploadResponse,
    UploadSessionDetail,
)


def generate_case_name(now: datetime | None = None) -> str:
    current = (now or datetime.now(UTC)).astimezone(UTC)
    return current.strftime("Investigation %b %d, %Y %H:%M UTC")


def _assert_single_owner(*, user_id: str | None, guest_id: str | None) -> None:
    if bool(user_id) == bool(guest_id):
        raise ValueError("Exactly one tenant owner is required.")


def _tenant_case_query(
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
):
    statement = select(CaseRecord).options(selectinload(CaseRecord.upload_sessions))
    if user_id:
        return statement.where(CaseRecord.user_id == user_id)
    if guest_id:
        return statement.where(CaseRecord.guest_id == guest_id)
    return statement.where(CaseRecord.id == "__no_match__")


async def create_case(
    session: AsyncSession,
    name: str | None = None,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
) -> CaseRecord:
    _assert_single_owner(user_id=user_id, guest_id=guest_id)
    case = CaseRecord(name=name or generate_case_name(), user_id=user_id, guest_id=guest_id)
    session.add(case)
    await session.flush()
    return case


async def get_case_or_none(
    session: AsyncSession,
    case_id: str,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
) -> CaseRecord | None:
    statement = _tenant_case_query(user_id=user_id, guest_id=guest_id).where(CaseRecord.id == case_id)
    result = await session.execute(statement)
    return result.scalar_one_or_none()


async def list_cases(session: AsyncSession, *, user_id: str) -> list[CaseRecord]:
    statement = _tenant_case_query(user_id=user_id).order_by(CaseRecord.created_at.desc())
    result = await session.execute(statement)
    return list(result.scalars().unique())


async def create_upload_session(
    session: AsyncSession,
    *,
    case: CaseRecord,
    filename: str,
    source_type: str = "upload",
    risk_score: int,
    snapshot: UploadResponse,
) -> UploadSessionRecord:
    record = UploadSessionRecord(
        case_id=case.id,
        user_id=case.user_id,
        guest_id=case.guest_id,
        filename=filename,
        source_type=source_type,
        risk_score=risk_score,
        raw_response_json=snapshot.model_dump(mode="json"),
    )
    session.add(record)
    await session.flush()
    return record


async def create_user(session: AsyncSession, *, email: str, password_hash: str) -> UserRecord:
    record = UserRecord(email=email, password_hash=password_hash)
    session.add(record)
    await session.flush()
    return record


async def get_user_by_email(session: AsyncSession, email: str) -> UserRecord | None:
    result = await session.execute(select(UserRecord).where(UserRecord.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: str) -> UserRecord | None:
    result = await session.execute(select(UserRecord).where(UserRecord.id == user_id))
    return result.scalar_one_or_none()


async def create_api_key(
    session: AsyncSession,
    *,
    user: UserRecord,
    hashed_key: str,
    name: str,
    scope: str,
) -> APIKeyRecord:
    record = APIKeyRecord(
        user_id=user.id,
        hashed_key=hashed_key,
        name=name,
        scope=scope,
    )
    session.add(record)
    await session.flush()
    return record


async def list_api_keys(session: AsyncSession, *, user_id: str) -> list[APIKeyRecord]:
    result = await session.execute(
        select(APIKeyRecord)
        .where(APIKeyRecord.user_id == user_id)
        .order_by(APIKeyRecord.created_at.desc())
    )
    return list(result.scalars())


async def get_api_key_by_hash(session: AsyncSession, hashed_key: str) -> APIKeyRecord | None:
    result = await session.execute(
        select(APIKeyRecord)
        .options(selectinload(APIKeyRecord.user))
        .where(APIKeyRecord.hashed_key == hashed_key)
    )
    return result.scalar_one_or_none()


async def revoke_api_key(session: AsyncSession, *, key_id: str, user_id: str) -> APIKeyRecord | None:
    result = await session.execute(
        select(APIKeyRecord)
        .where(APIKeyRecord.id == key_id, APIKeyRecord.user_id == user_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        return None
    record.revoked_at = datetime.now(UTC)
    await session.flush()
    return record


async def get_guest_usage(session: AsyncSession, guest_id: str) -> GuestUsageRecord | None:
    result = await session.execute(select(GuestUsageRecord).where(GuestUsageRecord.guest_id == guest_id))
    return result.scalar_one_or_none()


async def increment_guest_usage(session: AsyncSession, guest_id: str) -> GuestUsageRecord:
    record = await get_guest_usage(session, guest_id)
    if record is None:
        record = GuestUsageRecord(guest_id=guest_id, usage_count=0)
        session.add(record)
    record.usage_count += 1
    record.updated_at = datetime.now(UTC)
    await session.flush()
    return record


async def clear_guest_usage(session: AsyncSession, guest_id: str) -> None:
    await session.execute(delete(GuestUsageRecord).where(GuestUsageRecord.guest_id == guest_id))


async def claim_guest_assets(session: AsyncSession, *, user: UserRecord, guest_id: str) -> None:
    cases_result = await session.execute(select(CaseRecord).where(CaseRecord.guest_id == guest_id))
    for case in cases_result.scalars():
        case.user_id = user.id
        case.guest_id = None

    sessions_result = await session.execute(select(UploadSessionRecord).where(UploadSessionRecord.guest_id == guest_id))
    for upload_session in sessions_result.scalars():
        upload_session.user_id = user.id
        upload_session.guest_id = None

    await clear_guest_usage(session, guest_id)
    await session.flush()


async def get_geo_cache(session: AsyncSession, ip: str) -> GeoCacheRecord | None:
    result = await session.execute(select(GeoCacheRecord).where(GeoCacheRecord.ip == ip))
    return result.scalar_one_or_none()


async def upsert_geo_cache(
    session: AsyncSession,
    *,
    ip: str,
    provider: str,
    status: str,
    geo: GeoLocation | None,
) -> GeoCacheRecord:
    existing = await get_geo_cache(session, ip)
    if existing is None:
        existing = GeoCacheRecord(ip=ip)
        session.add(existing)

    existing.provider = provider
    existing.last_status = status
    existing.resolved_at = datetime.now(UTC)
    existing.country = geo.country if geo else None
    existing.lat = geo.lat if geo else None
    existing.lon = geo.lon if geo else None
    await session.flush()
    return existing


async def create_shared_case(
    session: AsyncSession,
    *,
    case: CaseRecord,
    token_hash: str,
    expires_at: datetime,
) -> SharedCaseRecord:
    record = SharedCaseRecord(case_id=case.id, token_hash=token_hash, expires_at=expires_at)
    session.add(record)
    await session.flush()
    return record


async def get_shared_case_by_token_hash(session: AsyncSession, token_hash: str) -> SharedCaseRecord | None:
    statement = (
        select(SharedCaseRecord)
        .options(
            selectinload(SharedCaseRecord.case).selectinload(CaseRecord.upload_sessions),
        )
        .where(SharedCaseRecord.token_hash == token_hash)
    )
    result = await session.execute(statement)
    return result.scalar_one_or_none()


def is_geo_cache_fresh(record: GeoCacheRecord, ttl_seconds: int) -> bool:
    return datetime.now(UTC) - record.resolved_at <= timedelta(seconds=ttl_seconds)


def build_user_summary(user: UserRecord) -> UserSummary:
    return UserSummary(
        id=user.id,
        email=user.email,
        created_at=user.created_at.astimezone(UTC).isoformat(),
    )


def build_auth_response(user: UserRecord) -> AuthResponse:
    return AuthResponse(user=build_user_summary(user))


def build_case_reference(case: CaseRecord) -> CaseReference:
    return CaseReference(
        id=case.id,
        name=case.name,
        created_at=case.created_at.astimezone(UTC).isoformat(),
    )


def build_session_reference(record: UploadSessionRecord) -> SessionReference:
    return SessionReference(
        id=record.id,
        filename=record.filename,
        uploaded_at=record.uploaded_at.astimezone(UTC).isoformat(),
        source_type=record.source_type,
    )


def build_case_summary(case: CaseRecord) -> CaseSummary:
    ordered_sessions = sorted(case.upload_sessions, key=lambda item: item.uploaded_at)
    snapshots = [UploadResponse.model_validate(item.raw_response_json) for item in ordered_sessions]
    repeated_counter = Counter(
        detection.source_ip
        for snapshot in snapshots
        for detection in snapshot.detections
    )
    latest_session = ordered_sessions[-1] if ordered_sessions else None
    return CaseSummary(
        id=case.id,
        name=case.name,
        created_at=case.created_at.astimezone(UTC).isoformat(),
        session_count=len(ordered_sessions),
        latest_uploaded_at=latest_session.uploaded_at.astimezone(UTC).isoformat() if latest_session else None,
        latest_risk_score=latest_session.risk_score if latest_session else 0,
        repeated_attacker_count=sum(1 for appearances in repeated_counter.values() if appearances > 1),
    )


def build_case_detail(case: CaseRecord) -> CaseDetail:
    ordered_sessions = sorted(case.upload_sessions, key=lambda item: item.uploaded_at)
    session_details: list[UploadSessionDetail] = []
    risk_trend: list[RiskTrendPoint] = []
    geo_by_ip: dict[str, GeoLocation] = {}
    repeated_counter: Counter[str] = Counter()

    for record in ordered_sessions:
        snapshot = UploadResponse.model_validate(record.raw_response_json)
        session_details.append(
            UploadSessionDetail(
                id=record.id,
                filename=record.filename,
                uploaded_at=record.uploaded_at.astimezone(UTC).isoformat(),
                source_type=record.source_type,
                risk_score=record.risk_score,
                snapshot=snapshot,
            )
        )
        risk_trend.append(
            RiskTrendPoint(
                session_id=record.id,
                filename=record.filename,
                uploaded_at=record.uploaded_at.astimezone(UTC).isoformat(),
                risk_score=record.risk_score,
            )
        )
        for detection in snapshot.detections:
            repeated_counter[detection.source_ip] += 1
            if detection.geo:
                geo_by_ip[detection.source_ip] = detection.geo

    repeated_attackers = [
        RepeatedAttacker(ip=ip, appearances=count, latest_geo=geo_by_ip.get(ip))
        for ip, count in repeated_counter.items()
        if count > 1
    ]
    repeated_attackers.sort(key=lambda item: (-item.appearances, item.ip))

    return CaseDetail(
        id=case.id,
        name=case.name,
        created_at=case.created_at.astimezone(UTC).isoformat(),
        sessions=session_details,
        risk_trend=risk_trend,
        repeated_attackers=repeated_attackers,
    )


def build_shared_case_view(record: SharedCaseRecord) -> SharedCaseView:
    return SharedCaseView(
        case=build_case_detail(record.case),
        expires_at=record.expires_at.astimezone(UTC).isoformat(),
    )


def build_share_case_response(*, token: str, expires_at: datetime) -> ShareCaseResponse:
    return ShareCaseResponse(token=token, expires_at=expires_at.astimezone(UTC).isoformat())


def build_api_key_summary(record: APIKeyRecord) -> APIKeySummary:
    return APIKeySummary(
        id=record.id,
        name=record.name,
        scope=record.scope,
        created_at=record.created_at.astimezone(UTC).isoformat(),
        revoked_at=record.revoked_at.astimezone(UTC).isoformat() if record.revoked_at else None,
    )
