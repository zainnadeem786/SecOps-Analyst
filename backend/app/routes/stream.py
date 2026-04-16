from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ResolvedAuthContext, ensure_guest_limit_not_reached, ensure_ingest_authorized, resolve_websocket_context
from app.core.config import Settings, get_settings
from app.db.deps import get_db_session
from app.db.repositories import build_case_reference, create_case, get_case_or_none, increment_guest_usage
from app.models.log_model import (
    LiveStreamBatchMessage,
    LiveStreamEndMessage,
    LiveStreamLineMessage,
    LiveStreamStartMessage,
    LiveStreamUpdate,
    UploadResponse,
)
from app.services.alerting_service import AlertingService, get_alerting_service
from app.services.ai_explainer import OllamaExplainer, get_ai_explainer
from app.services.geoip_service import GeoIPService, get_geoip_service
from app.services.investigation_service import analyze_content

router = APIRouter()


def _build_live_update(
    *,
    response: UploadResponse,
    skipped_lines: int,
    total_lines: int,
) -> dict:
    payload = LiveStreamUpdate(
        events=response.events,
        detections=response.detections,
        ai_analysis=response.ai_analysis,
        timeline=response.timeline,
        risk_assessment=response.risk_assessment,
        attack_campaigns=response.attack_campaigns,
        case=response.case,
        session=response.session,
        skipped_lines=skipped_lines,
        total_lines=total_lines,
    )
    return payload.model_dump(mode="json")


@router.websocket("/ws/log-stream")
async def log_stream(
    websocket: WebSocket,
    settings: Settings = Depends(get_settings),
    ai_explainer: OllamaExplainer = Depends(get_ai_explainer),
    alerting_service: AlertingService = Depends(get_alerting_service),
    geoip_service: GeoIPService = Depends(get_geoip_service),
    db_session: AsyncSession = Depends(get_db_session),
) -> None:
    await websocket.accept()
    try:
        context = await resolve_websocket_context(websocket, db_session, settings)
        await ensure_ingest_authorized(context)
        user = context.user
        resolved_guest_id = context.guest_id
        await ensure_guest_limit_not_reached(
            ResolvedAuthContext(user=user, guest_id=resolved_guest_id, auth_source=context.auth_source),
            db_session,
            settings,
        )
    except HTTPException as exc:
        await websocket.send_json(exc.detail if isinstance(exc.detail, dict) else {"detail": str(exc.detail)})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication required.")
        return

    case = None
    filename = "live-stream.log"
    raw_lines: list[str] = []
    dirty_lines = 0
    started = False

    async def flush(*, final: bool) -> None:
        nonlocal dirty_lines
        if not started:
            return
        content = "\n".join(raw_lines)
        investigation = await analyze_content(
            content=content,
            filename=filename,
            ai_explainer=ai_explainer,
            db_session=db_session,
            geoip_service=geoip_service,
            case=case,
            user_id=user.id if user else None,
            guest_id=resolved_guest_id,
            persist_case_when_missing=False,
            persist_session_snapshot=final,
            source_type="live_stream",
            use_live_heuristic_ai=True,
        )
        if final and resolved_guest_id and investigation.parse_result.events:
            await increment_guest_usage(db_session, resolved_guest_id)
        await db_session.commit()
        if final:
            await alerting_service.alert_for_snapshot(investigation.response)
        await websocket.send_json(
            _build_live_update(
                response=investigation.response,
                skipped_lines=investigation.parse_result.skipped_lines,
                total_lines=investigation.parse_result.total_lines,
            )
        )
        dirty_lines = 0

    try:
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=settings.websocket_flush_interval_seconds,
                )
            except asyncio.TimeoutError:
                if dirty_lines > 0:
                    await flush(final=False)
                continue

            if not isinstance(message, dict):
                await websocket.send_json({"type": "error", "detail": "Invalid websocket payload."})
                continue

            if not started:
                try:
                    start = LiveStreamStartMessage.model_validate(message)
                except Exception:
                    await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA, reason="Expected a start message.")
                    return

                if start.case_id:
                    case = await get_case_or_none(
                        db_session,
                        start.case_id,
                        user_id=user.id if user else None,
                        guest_id=resolved_guest_id,
                    )
                    if case is None:
                        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Case not found.")
                        return
                else:
                    case = await create_case(
                        db_session,
                        user_id=user.id if user else None,
                        guest_id=resolved_guest_id,
                    )
                    await db_session.commit()

                filename = (start.filename or "live-stream.log").strip() or "live-stream.log"
                started = True
                await websocket.send_json({"type": "ready", "case": build_case_reference(case).model_dump(mode="json")})
                continue

            message_type = str(message.get("type", "")).strip()
            if message_type == "line":
                payload = LiveStreamLineMessage.model_validate(message)
                line = payload.line.strip()
                if line:
                    raw_lines.append(line)
                    dirty_lines += 1
            elif message_type == "batch":
                payload = LiveStreamBatchMessage.model_validate(message)
                lines = [line.strip() for line in payload.lines if line.strip()]
                raw_lines.extend(lines)
                dirty_lines += len(lines)
            elif message_type == "end":
                LiveStreamEndMessage.model_validate(message)
                await flush(final=True)
                await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)
                return
            else:
                await websocket.send_json({"type": "error", "detail": f"Unsupported message type '{message_type}'."})
                continue

            if dirty_lines >= settings.websocket_flush_line_count:
                await flush(final=False)
    except WebSocketDisconnect:
        if dirty_lines > 0:
            try:
                await flush(final=True)
            except Exception:
                await db_session.rollback()
    except Exception:
        await db_session.rollback()
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="Live stream processing failed.")
