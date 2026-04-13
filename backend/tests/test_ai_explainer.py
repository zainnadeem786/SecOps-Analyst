import asyncio

import pytest

from app.core.config import Settings
from app.models.log_model import Detection
from app.services.ai_explainer import OllamaExplainer


class MissingModelProbe(OllamaExplainer):
    async def _fetch_tags(self) -> dict:
        return {"models": [{"name": "phi3:latest"}]}


@pytest.fixture
def sample_detection() -> Detection:
    return Detection(
        type="brute_force",
        severity="High",
        description="Source IP 203.0.113.10 generated repeated failed logins.",
        source_ip="203.0.113.10",
        count=7,
        evidence=[
            "2026-04-09T10:00:01+00:00 | /login | 401",
            "2026-04-09T10:00:02+00:00 | /login | 401",
        ],
    )


def test_build_prompt_uses_detection_summary_only(sample_detection: Detection) -> None:
    explainer = OllamaExplainer(Settings())

    prompt = explainer._build_prompt([sample_detection])

    assert "Detected 1 suspicious activities:" in prompt
    assert "Brute Force" in prompt
    assert "Source IP: 203.0.113.10" in prompt
    assert "total_events" not in prompt
    assert '"status_code"' not in prompt


def test_parse_completion_accepts_json_wrapped_in_code_fences() -> None:
    explainer = OllamaExplainer(Settings())

    parsed = explainer._parse_completion(
        "```json\n{\"explanation\": \"Repeated failed logins detected.\", \"risk_level\": \"medium\", \"recommended_action\": \"Rate limit the login endpoint.\"}\n```"
    )

    assert parsed == {
        "explanation": "Repeated failed logins detected.",
        "risk_level": "Medium",
        "recommended_action": "Rate limit the login endpoint.",
    }


def test_parse_completion_rejects_invalid_risk_level() -> None:
    explainer = OllamaExplainer(Settings())

    with pytest.raises(ValueError, match="Invalid risk level"):
        explainer._parse_completion(
            '{"explanation": "Probe detected.", "risk_level": "Severe", "recommended_action": "Investigate."}'
        )


def test_health_status_is_degraded_when_configured_model_is_missing() -> None:
    explainer = MissingModelProbe(Settings())

    health = asyncio.run(explainer.health_status())

    assert health.status == "degraded"
    assert health.ollama_available is True
    assert health.model_present is False
