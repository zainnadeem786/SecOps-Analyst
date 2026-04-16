from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CaseRecord, UploadSessionRecord
from app.db.repositories import (
    build_case_reference,
    build_session_reference,
    create_case,
    create_upload_session,
)
from app.models.log_model import AIAnalysis, AttackCampaign, Detection, RiskAssessment, UploadResponse
from app.services.ai_explainer import OllamaExplainer
from app.services.correlation_engine import build_attack_campaigns
from app.services.detector import detect_suspicious_activity
from app.services.geoip_service import GeoIPService
from app.services.parser import ParseResult, parse_log_content
from app.services.risk_engine import calculate_risk_assessment
from app.services.rules_service import load_rules_config
from app.services.timeline import build_attack_timeline


@dataclass(slots=True)
class InvestigationResult:
    response: UploadResponse
    parse_result: ParseResult
    case: CaseRecord | None
    session_record: UploadSessionRecord | None


def build_heuristic_ai_analysis(
    ai_explainer: OllamaExplainer,
    detections: list[Detection],
    risk_assessment: RiskAssessment,
    *,
    warning: str | None = None,
) -> AIAnalysis:
    if not detections:
        return AIAnalysis(
            explanation="No suspicious activity matched the configured detection rules for this stream snapshot.",
            risk_level=risk_assessment.risk_level,
            risk_score=risk_assessment.risk_score,
            recommended_action=(
                "Continue monitoring the stream. If you need persistent evidence, stop the session "
                "to save the final investigation snapshot."
            ),
            next_steps=[
                "Keep the stream running and watch for suspicious changes.",
                "Stop the live session to save a final snapshot when needed.",
                "Tune the rules if you need broader coverage for this source.",
            ],
            source="fallback",
            warning=warning,
        )
    return ai_explainer._build_fallback_analysis(
        detections,
        risk_assessment=risk_assessment,
        warning=warning or "Live mode uses heuristic analyst summaries during streaming.",
    )


async def analyze_content(
    *,
    content: str,
    filename: str,
    ai_explainer: OllamaExplainer,
    db_session: AsyncSession,
    geoip_service: GeoIPService,
    case: CaseRecord | None = None,
    user_id: str | None = None,
    guest_id: str | None = None,
    persist_case_when_missing: bool,
    persist_session_snapshot: bool,
    source_type: str = "upload",
    use_live_heuristic_ai: bool = False,
) -> InvestigationResult:
    parse_result = parse_log_content(content)
    if not parse_result.events:
        return InvestigationResult(
            response=UploadResponse(
                events=[],
                detections=[],
                ai_analysis=build_heuristic_ai_analysis(
                    ai_explainer,
                    [],
                    RiskAssessment(risk_score=0, risk_level="Low"),
                ),
                timeline=[],
                risk_assessment=RiskAssessment(risk_score=0, risk_level="Low"),
                attack_campaigns=[],
                case=build_case_reference(case) if case else None,
            ),
            parse_result=parse_result,
            case=case,
            session_record=None,
        )

    rules = load_rules_config()
    detections = detect_suspicious_activity(
        parse_result.events,
        rules,
        inspected_events=parse_result.inspected_events,
    )
    timeline = build_attack_timeline(parse_result.events, detections)
    attack_campaigns = build_attack_campaigns(parse_result.events, detections, timeline, rules=rules)
    risk_assessment = calculate_risk_assessment(
        parse_result.events,
        detections,
        include_repeated_ip_bonus=True,
        rules=rules,
    )
    ai_analysis = (
        build_heuristic_ai_analysis(ai_explainer, detections, risk_assessment)
        if use_live_heuristic_ai
        else await ai_explainer.analyze(
            detections,
            risk_assessment=risk_assessment,
            attack_campaigns=attack_campaigns,
        )
    )

    enriched_detections, enriched_campaigns = await enrich_geo_data(
        db_session,
        geoip_service,
        detections=detections,
        attack_campaigns=attack_campaigns,
    )

    working_case = case
    if working_case is None and persist_case_when_missing:
        working_case = await create_case(db_session, user_id=user_id, guest_id=guest_id)

    response = UploadResponse(
        events=parse_result.events,
        detections=enriched_detections,
        ai_analysis=ai_analysis,
        timeline=timeline,
        risk_assessment=risk_assessment,
        attack_campaigns=enriched_campaigns,
        case=build_case_reference(working_case) if working_case else None,
    )

    session_record: UploadSessionRecord | None = None
    if persist_session_snapshot and working_case is not None:
        session_record = await create_upload_session(
            db_session,
            case=working_case,
            filename=filename,
            source_type=source_type,
            risk_score=risk_assessment.risk_score,
            snapshot=response,
        )
        response = response.model_copy(update={"session": build_session_reference(session_record)})
        session_record.raw_response_json = response.model_dump(mode="json")
        await db_session.flush()

    return InvestigationResult(
        response=response,
        parse_result=parse_result,
        case=working_case,
        session_record=session_record,
    )


async def enrich_geo_data(
    db_session: AsyncSession,
    geoip_service: GeoIPService,
    *,
    detections: list[Detection],
    attack_campaigns: list[AttackCampaign],
) -> tuple[list[Detection], list[AttackCampaign]]:
    suspicious_ips = {detection.source_ip for detection in detections} | {
        campaign.attacker_ip for campaign in attack_campaigns
    }
    geo_by_ip = await geoip_service.resolve_many(db_session, suspicious_ips)
    enriched_detections = [
        detection.model_copy(update={"geo": geo_by_ip.get(detection.source_ip)})
        for detection in detections
    ]
    enriched_campaigns = [
        campaign.model_copy(update={"geo": geo_by_ip.get(campaign.attacker_ip)})
        for campaign in attack_campaigns
    ]
    return enriched_detections, enriched_campaigns
