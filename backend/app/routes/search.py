from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ResolvedAuthContext, get_resolved_auth_context
from app.db.deps import get_db_session
from app.db.repositories import get_case_or_none
from app.models.log_model import SearchResponse
from app.services.query_parser import parse_query
from app.services.search_service import build_search_response

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchResponse, summary="Search within an authorized case")
async def search_case_data(
    q: str = Query(..., min_length=1),
    case_id: str = Query(..., min_length=1),
    session_id: str | None = Query(default=None),
    context: ResolvedAuthContext = Depends(get_resolved_auth_context),
    db_session: AsyncSession = Depends(get_db_session),
) -> SearchResponse:
    if context.auth_source == "invalid_api_key":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key.")
    if context.is_api_key and context.api_key_scope != "read":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API key does not have read scope.")
    case = await get_case_or_none(
        db_session,
        case_id,
        user_id=context.user_id,
        guest_id=context.guest_id,
    )
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    filters = parse_query(q)
    return build_search_response(case=case, query=q, filters=filters, session_id=session_id)
