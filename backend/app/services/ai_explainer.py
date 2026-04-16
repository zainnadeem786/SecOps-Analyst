import json
import logging
import re
import time
from functools import lru_cache
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.models.log_model import AIAnalysis, AttackCampaign, Detection, HealthResponse, RiskAssessment

logger = logging.getLogger(__name__)

ALLOWED_RISK_LEVELS = {"Low", "Medium", "High", "Critical"}
RISK_LEVEL_SCORES = {
    "Low": 1,
    "Medium": 2,
    "High": 3,
    "Critical": 4,
}
OLLAMA_CONNECT_TIMEOUT_SECONDS = 10.0
OLLAMA_HEALTH_TIMEOUT_SECONDS = 10.0
CODE_FENCE_PATTERN = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.IGNORECASE | re.DOTALL)


class OllamaExplainer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.base_url = settings.ollama_url.rstrip("/")
        self.request_timeout = httpx.Timeout(
            connect=min(OLLAMA_CONNECT_TIMEOUT_SECONDS, settings.ollama_timeout_seconds),
            read=settings.ollama_timeout_seconds,
            write=30.0,
            pool=10.0,
        )

    async def analyze(
        self,
        detections: list[Detection],
        risk_assessment: RiskAssessment | None = None,
        attack_campaigns: list[AttackCampaign] | None = None,
    ) -> AIAnalysis:
        authoritative_risk = risk_assessment or _default_risk_assessment(detections)
        campaigns = attack_campaigns or []

        if not detections:
            return AIAnalysis(
                explanation="No suspicious activity matched the configured detection rules for this upload.",
                risk_level=authoritative_risk.risk_level,
                risk_score=authoritative_risk.risk_score,
                recommended_action=(
                    "Retain the log for audit purposes, continue normal monitoring, and extend "
                    "the rule set if you need broader threat coverage."
                ),
                next_steps=[
                    "Retain this upload for audit and baseline comparison.",
                    "Continue monitoring for new suspicious activity.",
                    "Refine detection rules if broader coverage is required.",
                ],
                source="fallback",
            )

        prompt = self._build_prompt(detections, authoritative_risk, campaigns)

        try:
            raw_response = await self._request_completion(prompt, len(detections))
            structured_response = self._parse_completion(raw_response)
            return AIAnalysis(
                explanation=structured_response["explanation"],
                risk_level=authoritative_risk.risk_level,
                risk_score=authoritative_risk.risk_score,
                recommended_action=structured_response["recommended_action"],
                next_steps=structured_response["next_steps"],
                source="ollama",
            )
        except (httpx.HTTPError, TimeoutError, json.JSONDecodeError, ValidationError, ValueError) as exc:
            logger.warning(
                "Falling back to heuristic AI analysis [%s]: %s",
                exc.__class__.__name__,
                exc,
            )
            return self._build_fallback_analysis(
                detections,
                risk_assessment=authoritative_risk,
                warning=_build_fallback_warning(exc),
            )

    async def health_status(self) -> HealthResponse:
        try:
            tags_payload = await self._fetch_tags()
            models = tags_payload.get("models", [])
            configured_model = self.settings.ollama_model
            model_present = any(
                _normalise_model_name(model.get("name", "")) == configured_model
                for model in models
            )
            if not model_present:
                return HealthResponse(
                    status="degraded",
                    ollama_available=True,
                    ollama_model=configured_model,
                    model_present=False,
                    warning="Ollama is reachable, but the configured model is not installed.",
                )

            return HealthResponse(
                status="ok",
                ollama_available=True,
                ollama_model=configured_model,
                model_present=True,
            )
        except httpx.HTTPError as exc:
            logger.warning("Ollama health check failed [%s]: %s", exc.__class__.__name__, exc)
            return HealthResponse(
                status="degraded",
                ollama_available=False,
                ollama_model=self.settings.ollama_model,
                model_present=False,
                warning="Ollama could not be reached from the backend.",
            )

    async def _request_completion(self, prompt: str, detection_count: int) -> str:
        payload = {
            "model": self.settings.ollama_model,
            "prompt": prompt,
            "stream": False,
        }

        logger.info(
            "Sending Ollama request to %s/api/generate (model=%s, detections=%s, timeout=%ss)",
            self.base_url,
            self.settings.ollama_model,
            detection_count,
            self.settings.ollama_timeout_seconds,
        )
        started_at = time.perf_counter()

        async with httpx.AsyncClient(timeout=self.request_timeout) as client:
            response = await client.post(f"{self.base_url}/api/generate", json=payload)
            elapsed_ms = round((time.perf_counter() - started_at) * 1000, 1)
            logger.info("Ollama response status=%s elapsed_ms=%s", response.status_code, elapsed_ms)
            response.raise_for_status()
            response_payload = response.json()

        if "response" not in response_payload:
            raise ValueError("Ollama response did not contain a 'response' field.")

        return str(response_payload["response"]).strip()

    async def _fetch_tags(self) -> dict[str, Any]:
        timeout = httpx.Timeout(
            connect=min(5.0, self.settings.ollama_timeout_seconds),
            read=min(OLLAMA_HEALTH_TIMEOUT_SECONDS, self.settings.ollama_timeout_seconds),
            write=5.0,
            pool=5.0,
        )
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            return response.json()

    def _build_prompt(
        self,
        detections: list[Detection],
        risk_assessment: RiskAssessment,
        attack_campaigns: list[AttackCampaign],
    ) -> str:
        detections_summary = self._build_detection_summary(detections)
        campaign_summary = self._build_campaign_summary(attack_campaigns)
        return (
            "You are a SOC analyst. Only use the provided data. Do not assume anything.\n\n"
            f"Detections:\n{detections_summary}\n\n"
            f"Risk Assessment:\n- Overall score: {risk_assessment.risk_score}\n- Overall level: {risk_assessment.risk_level}\n\n"
            f"Attack Campaigns:\n{campaign_summary}\n\n"
            "Explain:\n"
            "1. What attack story is unfolding\n"
            "2. Why the computed risk score matters\n"
            "3. Recommended actions\n"
            "4. Next steps for the analyst\n\n"
            "Return strict JSON with exactly these keys: explanation, risk_level, recommended_action, next_steps. "
            "The next_steps value must be an array with exactly 3 short strings. "
            "The risk_level value must be one string, never an array or object. "
            "If multiple findings differ in severity, choose the highest overall risk. "
            "Do not include markdown, code fences, or any extra commentary. "
            "Keep the response concise and accurate."
        )

    def _build_detection_summary(self, detections: list[Detection]) -> str:
        summary_lines = [f"Detected {len(detections)} suspicious activities:"]
        for detection in detections:
            evidence = "; ".join(detection.evidence[:2]) if detection.evidence else "No compact evidence available"
            summary_lines.append(
                "- "
                f"{_humanize_detection_type(detection.type)} | "
                f"Severity: {detection.severity} | "
                f"Source IP: {detection.source_ip} | "
                f"Count: {detection.count} | "
                f"Description: {detection.description} | "
                f"Evidence: {evidence}"
            )
        return "\n".join(summary_lines)

    def _build_campaign_summary(self, attack_campaigns: list[AttackCampaign]) -> str:
        if not attack_campaigns:
            return "- No grouped campaigns were available."

        summary_lines: list[str] = []
        for campaign in attack_campaigns:
            populated_phases = [phase.phase for phase in campaign.phases if phase.events]
            phases = ", ".join(populated_phases) if populated_phases else "No populated phases"
            summary_lines.append(
                "- "
                f"{campaign.campaign_name} | "
                f"Attacker IP: {campaign.attacker_ip} | "
                f"Risk: {campaign.risk_level} ({campaign.risk_score}) | "
                f"Severity: {campaign.severity} | "
                f"Phases: {phases}"
            )
        return "\n".join(summary_lines)

    def _parse_completion(self, raw_response: str) -> dict[str, Any]:
        parsed_response = _extract_json_object(raw_response)
        if not isinstance(parsed_response, dict):
            raise ValueError("Ollama JSON output must be an object.")

        explanation = str(parsed_response.get("explanation", "")).strip()
        risk_level = _normalise_risk_level(parsed_response.get("risk_level", ""))
        recommended_action = str(parsed_response.get("recommended_action", "")).strip()
        next_steps = _normalise_next_steps(parsed_response.get("next_steps"))

        if not explanation or not recommended_action:
            raise ValueError("Ollama JSON output is missing required text fields.")
        if risk_level not in ALLOWED_RISK_LEVELS:
            risk_level = ""
        if not next_steps:
            raise ValueError("Ollama JSON output must contain next_steps.")

        return {
            "explanation": explanation,
            "risk_level": risk_level,
            "recommended_action": recommended_action,
            "next_steps": next_steps,
        }

    def _build_fallback_analysis(
        self,
        detections: list[Detection],
        risk_assessment: RiskAssessment,
        warning: str,
    ) -> AIAnalysis:
        highest_severity = max(detections, key=lambda item: _severity_score(item.severity))
        recommended_action = (
            "Investigate the flagged source IPs, validate the targeted endpoints, and consider "
            "rate-limiting, blocking, or hardening exposed authentication paths."
        )

        explanation = (
            f"Rule-based analysis identified {len(detections)} suspicious pattern(s). "
            f"The highest severity finding is {highest_severity.severity.lower()} risk and "
            f"originates from {highest_severity.source_ip}."
        )

        return AIAnalysis(
            explanation=explanation,
            risk_level=risk_assessment.risk_level,
            risk_score=risk_assessment.risk_score,
            recommended_action=recommended_action,
            next_steps=_build_default_next_steps(detections),
            source="fallback",
            warning=warning,
        )


def _severity_score(severity: str) -> int:
    return {
        "Low": 1,
        "Moderate": 2,
        "Medium": 3,
        "High": 4,
        "Critical": 5,
    }.get(severity, 0)


def _coerce_risk_level(severity: str) -> str:
    if severity in ALLOWED_RISK_LEVELS:
        return severity
    if severity == "Moderate":
        return "Medium"
    return "Low"


def _normalise_model_name(model_name: str) -> str:
    return model_name.split(":", maxsplit=1)[0]


def _normalise_risk_level(value: Any) -> str:
    extracted_levels = _extract_risk_levels(value)
    if extracted_levels:
        return max(extracted_levels, key=lambda level: RISK_LEVEL_SCORES[level])

    return str(value).strip().title()


def _extract_risk_levels(value: Any) -> list[str]:
    if isinstance(value, list):
        levels: list[str] = []
        for item in value:
            levels.extend(_extract_risk_levels(item))
        return levels

    text = str(value).strip()
    if not text:
        return []

    matches = re.findall(r"\b(low|moderate|medium|high|critical)\b", text, flags=re.IGNORECASE)
    return [_coerce_risk_level(match.title()) for match in matches]


def _build_fallback_warning(exc: Exception) -> str:
    if isinstance(exc, (httpx.HTTPError, TimeoutError)):
        return "Live AI was unavailable or timed out, so the dashboard is showing a heuristic summary instead."
    return "Live AI returned an unusable response, so the dashboard is showing a heuristic summary instead."


def _default_risk_assessment(detections: list[Detection]) -> RiskAssessment:
    if not detections:
        return RiskAssessment(risk_score=0, risk_level="Low")

    highest_severity = max(detections, key=lambda item: _severity_score(item.severity)).severity
    score = {
        "Low": 20,
        "Moderate": 30,
        "Medium": 55,
        "High": 80,
        "Critical": 95,
    }.get(highest_severity, 0)
    return RiskAssessment(
        risk_score=score,
        risk_level=_score_to_risk_level(score),
    )


def _score_to_risk_level(score: int) -> str:
    if score <= 30:
        return "Low"
    if score <= 70:
        return "Medium"
    return "High"


def _humanize_detection_type(detection_type: str) -> str:
    return detection_type.replace("_", " ").title()


def _strip_code_fences(text: str) -> str:
    stripped = text.strip()
    fenced_match = CODE_FENCE_PATTERN.match(stripped)
    if fenced_match:
        return fenced_match.group(1).strip()
    return stripped


def _extract_json_object(raw_response: str) -> dict[str, Any]:
    cleaned = _strip_code_fences(raw_response)
    decoder = json.JSONDecoder()

    for index, character in enumerate(cleaned):
        if character != "{":
            continue

        try:
            parsed, _ = decoder.raw_decode(cleaned[index:])
        except json.JSONDecodeError:
            continue

        if isinstance(parsed, dict):
            return parsed

    raise ValueError("No JSON object found in Ollama response.")


def _normalise_next_steps(value: Any) -> list[str]:
    if isinstance(value, list):
        steps = [str(item).strip() for item in value if str(item).strip()]
        return steps[:3]
    if isinstance(value, str):
        candidates = [item.strip(" -\t") for item in value.splitlines() if item.strip()]
        return candidates[:3]
    return []


def _build_default_next_steps(detections: list[Detection]) -> list[str]:
    if any(detection.type == "account_compromise_suspected" for detection in detections):
        return [
            "Investigate successful logins that followed the failed attempts.",
            "Reset or lock the affected account and review MFA coverage.",
            "Block the suspicious source and preserve authentication evidence.",
        ]
    if any(detection.type in {"sql_injection", "command_injection", "path_traversal"} for detection in detections):
        return [
            "Block the malicious source and inspect the targeted application paths.",
            "Review server and application logs for successful exploitation signs.",
            "Patch or harden the exposed endpoints and add compensating controls.",
        ]
    if any(detection.type == "suspicious_user_agent" for detection in detections):
        return [
            "Review scanner-style traffic from the flagged source infrastructure.",
            "Tune edge controls or WAF rules for the observed client signature.",
            "Correlate the requests with other reconnaissance activity in the case.",
        ]
    if any(detection.type == "brute_force" for detection in detections):
        return [
            "Block or rate-limit the flagged authentication sources.",
            "Review authentication logs for successful follow-on access.",
            "Harden exposed login and token endpoints.",
        ]
    if any(detection.type == "scanning_fuzzing" for detection in detections):
        return [
            "Review the scanned endpoints for exposed services.",
            "Block or throttle the scanning source if activity continues.",
            "Check edge controls and WAF coverage for the targeted paths.",
        ]
    return [
        "Investigate the flagged IPs and affected endpoints.",
        "Preserve the session evidence for follow-up analysis.",
        "Tune network or application controls to reduce repeat activity.",
    ]


@lru_cache(maxsize=1)
def get_ai_explainer() -> OllamaExplainer:
    return OllamaExplainer(get_settings())

