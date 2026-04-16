from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ResolvedAuthContext, require_cookie_user
from app.core.config import Settings, get_settings
from app.core.security import generate_share_token, hash_share_token
from app.db.deps import get_db_session
from app.db.repositories import (
    build_share_case_response,
    build_shared_case_view,
    create_shared_case,
    get_case_or_none,
    get_shared_case_by_token_hash,
)
from app.models.log_model import ShareCaseRequest, ShareCaseResponse, SharedCaseView

router = APIRouter(tags=["sharing"])


@router.post("/cases/{case_id}/share", response_model=ShareCaseResponse, summary="Create a secure shared case link")
async def share_case(
    case_id: str,
    payload: ShareCaseRequest,
    context: ResolvedAuthContext = Depends(require_cookie_user),
    db_session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> ShareCaseResponse:
    case = await get_case_or_none(db_session, case_id, user_id=context.user_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    token = generate_share_token()
    expires_at = datetime.now(UTC) + timedelta(hours=payload.expires_in_hours or settings.share_link_ttl_hours)
    await create_shared_case(
        db_session,
        case=case,
        token_hash=hash_share_token(token),
        expires_at=expires_at,
    )
    await db_session.commit()
    return build_share_case_response(token=token, expires_at=expires_at)


@router.get("/share/{token}", response_model=SharedCaseView, summary="View a read-only shared case")
async def view_shared_case(
    token: str,
    db_session: AsyncSession = Depends(get_db_session),
) -> SharedCaseView:
    record = await get_shared_case_by_token_hash(db_session, hash_share_token(token))
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared case not found.")
    if record.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This shared case link has expired.")
    return build_shared_case_view(record)
