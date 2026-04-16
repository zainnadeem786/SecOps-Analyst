from __future__ import annotations

import asyncio
import logging
import smtplib
from dataclasses import dataclass
from datetime import UTC, datetime
from email.message import EmailMessage
from functools import lru_cache

import httpx

from app.core.config import Settings, get_settings
from app.models.log_model import AttackCampaign, Detection, UploadResponse
from app.services.detector import SEVERITY_RANK

logger = logging.getLogger(__name__)

CRITICAL_ALERT_TYPES = {
    "brute_force",
    "path_traversal",
    "sql_injection",
    "command_injection",
    "account_compromise_suspected",
}


@dataclass(slots=True)
class AlertPayload:
    type: str
    case_id: str | None
    risk_score: int
    top_ip: str | None
    timestamp: str

    def to_dict(self) -> dict[str, str | int | None]:
        return {
            "type": self.type,
            "case_id": self.case_id,
            "risk_score": self.risk_score,
            "top_ip": self.top_ip,
            "timestamp": self.timestamp,
        }


class AlertingService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def alert_for_snapshot(self, response: UploadResponse) -> None:
        payload = self._build_payload(response)
        if payload is None:
            return

        logger.warning("SOC alert triggered: %s", payload.to_dict())
        await self._send_webhook(payload)
        await self._send_email(payload)

    def _build_payload(self, response: UploadResponse) -> AlertPayload | None:
        if not response.detections:
            return None

        has_critical_detection = any(detection.type in CRITICAL_ALERT_TYPES for detection in response.detections)
        is_high_risk = response.risk_assessment.risk_score >= self.settings.alert_risk_threshold
        if not has_critical_detection and not is_high_risk:
            return None

        timestamp = (
            response.timeline[-1].timestamp
            if response.timeline
            else datetime.now(UTC).isoformat()
        )
        return AlertPayload(
            type="HIGH_RISK_INCIDENT" if is_high_risk else "CRITICAL_DETECTION",
            case_id=response.case.id if response.case else None,
            risk_score=response.risk_assessment.risk_score,
            top_ip=_derive_top_ip(response.attack_campaigns, response.detections),
            timestamp=timestamp,
        )

    async def _send_webhook(self, payload: AlertPayload) -> None:
        if not self.settings.alert_webhook_url:
            return

        timeout = httpx.Timeout(self.settings.alert_webhook_timeout_seconds)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(self.settings.alert_webhook_url, json=payload.to_dict())
                response.raise_for_status()
        except Exception as exc:  # pragma: no cover - defensive logging path
            logger.warning("Webhook alert delivery failed [%s]: %s", exc.__class__.__name__, exc)

    async def _send_email(self, payload: AlertPayload) -> None:
        if not self.settings.alert_email_enabled:
            return
        if not all(
            [
                self.settings.alert_email_from,
                self.settings.alert_email_to,
                self.settings.alert_smtp_host,
            ]
        ):
            logger.info("Email alert configured in stub mode only: %s", payload.to_dict())
            return

        try:
            await asyncio.to_thread(self._deliver_email, payload)
        except Exception as exc:  # pragma: no cover - defensive logging path
            logger.warning("Email alert delivery failed [%s]: %s", exc.__class__.__name__, exc)

    def _deliver_email(self, payload: AlertPayload) -> None:
        message = EmailMessage()
        message["Subject"] = f"[SecOps Analyst] {payload.type} ({payload.risk_score})"
        message["From"] = self.settings.alert_email_from
        message["To"] = self.settings.alert_email_to
        message.set_content(
            "\n".join(
                [
                    "A SOC alert was triggered.",
                    f"Type: {payload.type}",
                    f"Case ID: {payload.case_id or 'n/a'}",
                    f"Risk score: {payload.risk_score}",
                    f"Top IP: {payload.top_ip or 'n/a'}",
                    f"Timestamp: {payload.timestamp}",
                ]
            )
        )

        with smtplib.SMTP(self.settings.alert_smtp_host, self.settings.alert_smtp_port, timeout=10) as smtp:
            if self.settings.alert_smtp_use_tls:
                smtp.starttls()
            if self.settings.alert_smtp_username and self.settings.alert_smtp_password:
                smtp.login(self.settings.alert_smtp_username, self.settings.alert_smtp_password)
            smtp.send_message(message)


def _derive_top_ip(campaigns: list[AttackCampaign], detections: list[Detection]) -> str | None:
    if campaigns:
        highest_campaign = max(
            campaigns,
            key=lambda campaign: (
                campaign.risk_score,
                SEVERITY_RANK.get(campaign.severity, 0),
                campaign.attacker_ip,
            ),
        )
        return highest_campaign.attacker_ip

    if detections:
        highest_detection = max(
            detections,
            key=lambda detection: (
                SEVERITY_RANK.get(detection.severity, 0),
                detection.count,
                detection.source_ip,
            ),
        )
        return highest_detection.source_ip
    return None


@lru_cache(maxsize=1)
def get_alerting_service() -> AlertingService:
    return AlertingService(get_settings())
