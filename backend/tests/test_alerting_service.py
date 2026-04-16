from __future__ import annotations

import asyncio

from app.core.config import get_settings
from app.models.log_model import (
    AIAnalysis,
    AttackCampaign,
    CampaignPhase,
    CaseReference,
    Detection,
    RiskAssessment,
    TimelineItem,
    UploadResponse,
)
from app.services.alerting_service import AlertingService


def make_response() -> UploadResponse:
    return UploadResponse(
        events=[],
        detections=[
            Detection(
                type="sql_injection",
                severity="Critical",
                description="SQL injection attempts detected",
                source_ip="203.0.113.50",
                count=2,
                evidence=["2026-04-09T10:00:01+00:00 | /search | 500"],
            )
        ],
        ai_analysis=AIAnalysis(
            explanation="Suspicious exploitation activity was observed.",
            risk_level="High",
            risk_score=95,
            recommended_action="Block the source and review affected systems.",
            next_steps=["Block source", "Review logs", "Preserve evidence"],
            source="fallback",
        ),
        timeline=[
            TimelineItem(
                timestamp="2026-04-09T10:00:01+00:00",
                title="SQL injection attempt",
                description="Detected injection-style requests.",
                severity="Critical",
                type="sql_injection",
                ip="203.0.113.50",
            )
        ],
        risk_assessment=RiskAssessment(risk_score=95, risk_level="High"),
        attack_campaigns=[
            AttackCampaign(
                attacker_ip="203.0.113.50",
                campaign_name="Suspicious Activity Campaign",
                phases=[CampaignPhase(phase="Exploitation", events=[])],
                severity="Critical",
                risk_score=95,
                risk_level="High",
                timeline=[],
            )
        ],
        case=CaseReference(id="case-1", name="Investigation", created_at="2026-04-09T10:00:00+00:00"),
    )


class RecordingAlertingService(AlertingService):
    def __init__(self) -> None:
        super().__init__(get_settings())
        self.webhook_payloads: list[dict[str, str | int | None]] = []
        self.email_payloads: list[dict[str, str | int | None]] = []

    async def _send_webhook(self, payload):  # type: ignore[override]
        self.webhook_payloads.append(payload.to_dict())

    async def _send_email(self, payload):  # type: ignore[override]
        self.email_payloads.append(payload.to_dict())


def test_alerting_service_builds_and_emits_payload() -> None:
    service = RecordingAlertingService()
    response = make_response()

    asyncio.run(service.alert_for_snapshot(response))

    assert service.webhook_payloads[0]["type"] == "HIGH_RISK_INCIDENT"
    assert service.webhook_payloads[0]["case_id"] == "case-1"
    assert service.webhook_payloads[0]["top_ip"] == "203.0.113.50"
    assert service.email_payloads[0]["risk_score"] == 95


def test_alerting_service_skips_low_risk_noncritical_snapshots() -> None:
    service = RecordingAlertingService()
    response = make_response().model_copy(
        update={
            "detections": [
                Detection(
                    type="multi_endpoint_probe",
                    severity="Moderate",
                    description="Reconnaissance activity detected",
                    source_ip="192.0.2.77",
                    count=3,
                    evidence=[],
                )
            ],
            "risk_assessment": RiskAssessment(risk_score=25, risk_level="Low"),
        }
    )

    asyncio.run(service.alert_for_snapshot(response))

    assert service.webhook_payloads == []
    assert service.email_payloads == []
