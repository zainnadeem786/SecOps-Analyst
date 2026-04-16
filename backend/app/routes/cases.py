import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    ResolvedAuthContext,
    ensure_guest_limit_not_reached,
    ensure_ingest_authorized,
    get_resolved_auth_context,
    require_api_scope,
    require_cookie_user,
)
from app.core.config import Settings, get_settings
from app.db.deps import get_db_session
from app.db.repositories import (
    build_case_detail,
    build_case_reference,
    build_case_summary,
    create_case,
    get_case_or_none,
    increment_guest_usage,
    list_cases,
)
from app.models.log_model import CaseDetail, CaseReference, CaseSummary, CreateCaseRequest, UploadResponse
from app.services.alerting_service import AlertingService, get_alerting_service
from app.services.ai_explainer import OllamaExplainer, get_ai_explainer
from app.services.geoip_service import GeoIPService, get_geoip_service
from app.services.investigation_service import analyze_content
from app.services.upload_validation import read_uploaded_text

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/cases", response_model=CaseReference, summary="Create a new investigation case")
async def create_case_endpoint(
    payload: CreateCaseRequest,
    context: ResolvedAuthContext = Depends(require_cookie_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> CaseReference:
    case = await create_case(db_session, payload.name, user_id=context.user_id)
    await db_session.commit()
    return build_case_reference(case)


@router.get("/cases", response_model=list[CaseSummary], summary="List investigation cases")
async def list_cases_endpoint(
    context: ResolvedAuthContext = Depends(require_api_scope("read")),
    db_session: AsyncSession = Depends(get_db_session),
) -> list[CaseSummary]:
    cases = await list_cases(db_session, user_id=context.user_id)
    return [build_case_summary(case) for case in cases]


@router.get("/cases/{case_id}", response_model=CaseDetail, summary="Get full case details")
async def get_case_details(
    case_id: str,
    context: ResolvedAuthContext = Depends(get_resolved_auth_context),
    db_session: AsyncSession = Depends(get_db_session),
) -> CaseDetail:
    if context.auth_source == "invalid_api_key":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key.")
    if context.is_api_key and context.api_key_scope != "read":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API key does not have read scope.")
    case = await get_case_or_none(db_session, case_id, user_id=context.user_id, guest_id=context.guest_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    return build_case_detail(case)


@router.post("/cases/{case_id}/upload", response_model=UploadResponse, summary="Upload a log into an existing case")
async def upload_into_case(
    case_id: str,
    file: UploadFile | None = File(default=None),
    settings: Settings = Depends(get_settings),
    ai_explainer: OllamaExplainer = Depends(get_ai_explainer),
    alerting_service: AlertingService = Depends(get_alerting_service),
    geoip_service: GeoIPService = Depends(get_geoip_service),
    context: ResolvedAuthContext = Depends(get_resolved_auth_context),
    db_session: AsyncSession = Depends(get_db_session),
) -> UploadResponse:
    await ensure_ingest_authorized(context)
    case = await get_case_or_none(db_session, case_id, user_id=context.user_id, guest_id=context.guest_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    await ensure_guest_limit_not_reached(context, db_session, settings)

    filename, content = await read_uploaded_text(file, settings)
    investigation = await analyze_content(
        content=content,
        filename=filename,
        ai_explainer=ai_explainer,
        db_session=db_session,
        geoip_service=geoip_service,
        case=case,
        user_id=context.user_id,
        guest_id=context.guest_id,
        persist_case_when_missing=False,
        persist_session_snapshot=True,
        source_type="upload",
    )
    if not investigation.parse_result.events:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No supported access log entries were found in the uploaded file.",
        )

    if context.is_guest and context.guest_id:
        await increment_guest_usage(db_session, context.guest_id)
    await db_session.commit()
    await alerting_service.alert_for_snapshot(investigation.response)
    logger.info(
        "Processed case upload '%s' into case %s with session %s.",
        filename,
        case_id,
        investigation.response.session.id if investigation.response.session else "n/a",
    )
    return investigation.response
