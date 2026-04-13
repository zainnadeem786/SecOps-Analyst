import json
import logging
import re
import time
from functools import lru_cache
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.models.log_model import AIAnalysis, Detection, HealthResponse

logger = logging.getLogger(__name__)

ALLOWED_RISK_LEVELS = {"Low", "Medium", "High", "Critical"}
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

    async def analyze(self, detections: list[Detection]) -> AIAnalysis:
        if not detections:
            return AIAnalysis(
                explanation="No suspicious activity matched the configured detection rules for this upload.",
                risk_level="Low",
                recommended_action=(
                    "Retain the log for audit purposes, continue normal monitoring, and extend "
                    "the rule set if you need broader threat coverage."
                ),
                source="fallback",
            )

        prompt = self._build_prompt(detections)

        try:
            raw_response = await self._request_completion(prompt, len(detections))
            structured_response = self._parse_completion(raw_response)
            return AIAnalysis(
                explanation=structured_response["explanation"],
                risk_level=structured_response["risk_level"],
                recommended_action=structured_response["recommended_action"],
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
                warning="Ollama was unavailable, timed out, or returned invalid JSON. Showing a heuristic summary instead.",
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

    def _build_prompt(self, detections: list[Detection]) -> str:
        detections_summary = self._build_detection_summary(detections)
        return (
            "You are a SOC analyst. Only use the provided data. Do not assume anything.\n\n"
            f"Detections:\n{detections_summary}\n\n"
            "Explain:\n"
            "1. What is happening\n"
            "2. Risk level (Low/Medium/High)\n"
            "3. Recommended actions\n\n"
            "Return strict JSON with exactly these keys: explanation, risk_level, recommended_action. "
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

    def _parse_completion(self, raw_response: str) -> dict[str, str]:
        parsed_response = _extract_json_object(raw_response)
        if not isinstance(parsed_response, dict):
            raise ValueError("Ollama JSON output must be an object.")

        explanation = str(parsed_response.get("explanation", "")).strip()
        risk_level = _normalise_risk_level(parsed_response.get("risk_level", ""))
        recommended_action = str(parsed_response.get("recommended_action", "")).strip()

        if not explanation or not recommended_action:
            raise ValueError("Ollama JSON output is missing required text fields.")
        if risk_level not in ALLOWED_RISK_LEVELS:
            raise ValueError(f"Invalid risk level from Ollama: {risk_level!r}")

        return {
            "explanation": explanation,
            "risk_level": risk_level,
            "recommended_action": recommended_action,
        }

    def _build_fallback_analysis(self, detections: list[Detection], warning: str) -> AIAnalysis:
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
            risk_level=_coerce_risk_level(highest_severity.severity),
            recommended_action=recommended_action,
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
    risk_level = str(value).strip().title()
    if risk_level == "Moderate":
        return "Medium"
    return risk_level


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


@lru_cache(maxsize=1)
def get_ai_explainer() -> OllamaExplainer:
    return OllamaExplainer(get_settings())

