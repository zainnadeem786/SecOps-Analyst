from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ResolvedAuthContext, require_api_scope
from app.db.deps import get_db_session
from app.db.repositories import list_cases
from app.models.log_model import ExecutiveSummary
from app.services.executive_service import build_executive_summary

router = APIRouter(prefix="/executive", tags=["executive"])


@router.get("/summary", response_model=ExecutiveSummary, summary="Get authenticated executive dashboard metrics")
async def executive_summary(
    context: ResolvedAuthContext = Depends(require_api_scope("read")),
    db_session: AsyncSession = Depends(get_db_session),
) -> ExecutiveSummary:
    cases = await list_cases(db_session, user_id=context.user_id)
    return build_executive_summary(cases)
