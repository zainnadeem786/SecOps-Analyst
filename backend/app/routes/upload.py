import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import Settings, get_settings
from app.models.log_model import HealthResponse, UploadResponse
from app.services.ai_explainer import OllamaExplainer, get_ai_explainer
from app.services.detector import detect_suspicious_activity
from app.services.parser import parse_log_content

router = APIRouter()
logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".log", ".txt"}


@router.post("/upload-log", response_model=UploadResponse, summary="Upload and analyze a log file")
async def upload_log(
    file: UploadFile | None = File(default=None),
    settings: Settings = Depends(get_settings),
    ai_explainer: OllamaExplainer = Depends(get_ai_explainer),
) -> UploadResponse:
    if file is None or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A .log or .txt file is required.",
        )

    file_extension = Path(file.filename).suffix.lower()
    if file_extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .log and .txt files are supported.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Uploaded file exceeds the 10 MB limit.",
        )

    decoded_content = content.decode("utf-8", errors="replace")
    parse_result = parse_log_content(decoded_content)
    if not parse_result.events:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No supported access log entries were found in the uploaded file.",
        )

    detections = detect_suspicious_activity(parse_result.events)
    ai_analysis = await ai_explainer.analyze(detections)

    logger.info(
        "Processed upload '%s' with %s parsed events, %s detections, %s skipped lines.",
        file.filename,
        len(parse_result.events),
        len(detections),
        parse_result.skipped_lines,
    )

    return UploadResponse(
        events=parse_result.events,
        detections=detections,
        ai_analysis=ai_analysis,
    )


@router.get("/health", response_model=HealthResponse, summary="Service and Ollama readiness")
async def health_check(
    ai_explainer: OllamaExplainer = Depends(get_ai_explainer),
) -> HealthResponse:
    return await ai_explainer.health_status()
