import asyncio

import pytest

from app.core.config import Settings
from app.models.log_model import AttackCampaign, CampaignPhase, Detection, RiskAssessment, TimelineItem
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


@pytest.fixture
def sample_risk_assessment() -> RiskAssessment:
    return RiskAssessment(risk_score=82, risk_level="High")


@pytest.fixture
def sample_campaign() -> AttackCampaign:
    return AttackCampaign(
        attacker_ip="203.0.113.10",
        campaign_name="Credential Attack Campaign",
        phases=[
            CampaignPhase(phase="Reconnaissance", events=[]),
            CampaignPhase(phase="Scanning", events=[]),
            CampaignPhase(phase="Credential Attacks", events=[]),
            CampaignPhase(phase="Lateral Movement Hint", events=[]),
        ],
        severity="High",
        risk_score=30,
        risk_level="Low",
        timeline=[
            TimelineItem(
                timestamp="2026-04-09T10:00:01+00:00",
                title="Multiple failed login attempts",
                description="7 failed login attempts detected from IP 203.0.113.10. Targeted endpoint: /login.",
                severity="High",
                type="brute_force",
                ip="203.0.113.10",
            )
        ],
    )


def test_build_prompt_includes_detection_risk_and_campaign_context(
    sample_detection: Detection,
    sample_risk_assessment: RiskAssessment,
    sample_campaign: AttackCampaign,
) -> None:
    explainer = OllamaExplainer(Settings())

    prompt = explainer._build_prompt([sample_detection], sample_risk_assessment, [sample_campaign])

    assert "Detected 1 suspicious activities:" in prompt
    assert "Brute Force" in prompt
    assert "Source IP: 203.0.113.10" in prompt
    assert "Overall score: 82" in prompt
    assert "Credential Attack Campaign" in prompt
    assert "total_events" not in prompt
    assert '"status_code"' not in prompt


def test_parse_completion_accepts_json_wrapped_in_code_fences() -> None:
    explainer = OllamaExplainer(Settings())

    parsed = explainer._parse_completion(
        "```json\n{\"explanation\": \"Repeated failed logins detected.\", \"risk_level\": \"medium\", \"recommended_action\": \"Rate limit the login endpoint.\", \"next_steps\": [\"Block the source.\", \"Review auth logs.\", \"Harden the login route.\"]}\n```"
    )

    assert parsed == {
        "explanation": "Repeated failed logins detected.",
        "risk_level": "Medium",
        "recommended_action": "Rate limit the login endpoint.",
        "next_steps": ["Block the source.", "Review auth logs.", "Harden the login route."],
    }


def test_parse_completion_accepts_list_like_risk_levels_and_uses_highest() -> None:
    explainer = OllamaExplainer(Settings())

    parsed = explainer._parse_completion(
        '{"explanation": "Multiple suspicious stages were detected.", "risk_level": "[\'High\', \'Medium\', \'Moderate\']", "recommended_action": "Investigate the source IPs immediately.", "next_steps": ["Block the source.", "Review auth logs.", "Preserve evidence."]}'
    )

    assert parsed == {
        "explanation": "Multiple suspicious stages were detected.",
        "risk_level": "High",
        "recommended_action": "Investigate the source IPs immediately.",
        "next_steps": ["Block the source.", "Review auth logs.", "Preserve evidence."],
    }


def test_parse_completion_allows_unknown_risk_level_but_preserves_text_fields() -> None:
    explainer = OllamaExplainer(Settings())

    parsed = explainer._parse_completion(
        '{"explanation": "Probe detected.", "risk_level": "Severe", "recommended_action": "Investigate.", "next_steps": ["Review the attacker path.", "Check related endpoints.", "Preserve evidence."]}'
    )

    assert parsed == {
        "explanation": "Probe detected.",
        "risk_level": "",
        "recommended_action": "Investigate.",
        "next_steps": ["Review the attacker path.", "Check related endpoints.", "Preserve evidence."],
    }


def test_health_status_is_degraded_when_configured_model_is_missing() -> None:
    explainer = MissingModelProbe(Settings())

    health = asyncio.run(explainer.health_status())

    assert health.status == "degraded"
    assert health.ollama_available is True
    assert health.model_present is False
