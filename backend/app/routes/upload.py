import logging
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ResolvedAuthContext, ensure_guest_limit_not_reached, ensure_ingest_authorized, get_resolved_auth_context
from app.core.config import Settings, get_settings
from app.db.deps import get_db_session
from app.db.repositories import get_case_or_none, increment_guest_usage
from app.models.log_model import HealthResponse, UploadResponse
from app.services.alerting_service import AlertingService, get_alerting_service
from app.services.ai_explainer import OllamaExplainer, get_ai_explainer
from app.services.geoip_service import GeoIPService, get_geoip_service
from app.services.investigation_service import analyze_content
from app.services.report_export import build_incident_report_pdf
from app.services.upload_validation import read_uploaded_text

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/upload-log", response_model=UploadResponse, summary="Upload and analyze a log file")
async def upload_log(
    file: UploadFile | None = File(default=None),
    case_id: str | None = Form(default=None),
    settings: Settings = Depends(get_settings),
    ai_explainer: OllamaExplainer = Depends(get_ai_explainer),
    alerting_service: AlertingService = Depends(get_alerting_service),
    geoip_service: GeoIPService = Depends(get_geoip_service),
    context: ResolvedAuthContext = Depends(get_resolved_auth_context),
    db_session: AsyncSession = Depends(get_db_session),
) -> UploadResponse:
    filename, decoded_content = await read_uploaded_text(file, settings)
    await ensure_ingest_authorized(context)
    await ensure_guest_limit_not_reached(context, db_session, settings)
    case = None
    if case_id:
        case = await get_case_or_none(db_session, case_id, user_id=context.user_id, guest_id=context.guest_id)
        if case is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Case not found.",
            )

    investigation = await analyze_content(
        content=decoded_content,
        filename=filename,
        ai_explainer=ai_explainer,
        db_session=db_session,
        geoip_service=geoip_service,
        case=case,
        user_id=context.user_id,
        guest_id=context.guest_id,
        persist_case_when_missing=True,
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
        "Processed upload '%s' into case %s with %s parsed events, %s detections, %s skipped lines.",
        filename,
        investigation.response.case.id if investigation.response.case else "n/a",
        len(investigation.response.events),
        len(investigation.response.detections),
        investigation.parse_result.skipped_lines,
    )

    return investigation.response


@router.post("/export-report", summary="Export the analyzed incident report as PDF")
async def export_report(result: UploadResponse) -> Response:
    pdf_content = build_incident_report_pdf(result)
    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="incident-report.pdf"'},
    )


@router.get("/health", response_model=HealthResponse, summary="Service and Ollama readiness")
async def health_check(
    ai_explainer: OllamaExplainer = Depends(get_ai_explainer),
) -> HealthResponse:
    return await ai_explainer.health_status()
