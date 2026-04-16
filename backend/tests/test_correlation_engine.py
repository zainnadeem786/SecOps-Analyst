from app.models.log_model import Detection, ParsedEvent
from app.services.correlation_engine import build_attack_campaigns
from app.services.timeline import build_attack_timeline


def make_event(ip: str, endpoint: str, status_code: int, minute: int, second: int) -> ParsedEvent:
    return ParsedEvent(
        ip=ip,
        endpoint=endpoint,
        status_code=status_code,
        timestamp=f"2026-04-09T09:{minute:02d}:{second:02d}+00:00",
    )


def make_detection(detection_type: str, severity: str, source_ip: str, count: int) -> Detection:
    return Detection(
        type=detection_type,
        severity=severity,
        description=f"{detection_type} detected for {source_ip}",
        source_ip=source_ip,
        count=count,
        evidence=[],
    )


def test_build_attack_campaigns_creates_one_campaign_per_suspicious_ip() -> None:
    events = [
        make_event("203.0.113.10", "/login", 401, 0, 1),
        make_event("203.0.113.10", "/login", 401, 0, 2),
        make_event("198.51.100.24", "/admin", 404, 1, 1),
        make_event("198.51.100.24", "/debug", 404, 1, 2),
        make_event("192.0.2.77", "/admin", 200, 2, 1),
        make_event("192.0.2.77", "/billing", 200, 2, 2),
        make_event("192.0.2.77", "/docs", 200, 2, 3),
    ]
    detections = [
        make_detection("brute_force", "High", "203.0.113.10", 5),
        make_detection("scanning_fuzzing", "Medium", "198.51.100.24", 10),
        make_detection("multi_endpoint_probe", "Moderate", "192.0.2.77", 8),
    ]

    campaigns = build_attack_campaigns(events, detections, build_attack_timeline(events, detections))

    assert [campaign.attacker_ip for campaign in campaigns] == [
        "203.0.113.10",
        "198.51.100.24",
        "192.0.2.77",
    ]
    assert [campaign.campaign_name for campaign in campaigns] == [
        "Credential Attack Campaign",
        "Reconnaissance Campaign",
        "Suspicious Multi-Stage Attack",
    ]
    assert [phase.phase for phase in campaigns[0].phases] == [
        "Reconnaissance",
        "Scanning",
        "Credential Attacks",
        "Exploitation",
        "Lateral Movement Hint",
        "Impact",
    ]
    assert campaigns[0].phases[2].events
    assert campaigns[1].phases[1].events
    assert campaigns[2].phases[0].events
    assert campaigns[2].phases[4].events


def test_multi_endpoint_probe_only_adds_lateral_phase_for_sensitive_paths() -> None:
    events = [
        make_event("192.0.2.77", "/docs", 200, 2, 1),
        make_event("192.0.2.77", "/pricing", 200, 2, 2),
        make_event("192.0.2.77", "/integrations", 200, 2, 3),
    ]
    detections = [
        make_detection("multi_endpoint_probe", "Moderate", "192.0.2.77", 3),
    ]

    campaigns = build_attack_campaigns(events, detections, build_attack_timeline(events, detections))

    assert len(campaigns) == 1
    campaign = campaigns[0]
    assert campaign.campaign_name == "Reconnaissance Campaign"
    assert campaign.phases[0].events
    assert campaign.phases[4].events == []
    assert campaign.risk_score == 25
    assert campaign.risk_level == "Low"


def test_campaigns_split_when_gap_exceeds_configured_threshold() -> None:
    events = [
        make_event("203.0.113.10", "/login", 401, 0, 1),
        make_event("203.0.113.10", "/login", 401, 0, 2),
        make_event("203.0.113.10", "/login", 401, 45, 1),
        make_event("203.0.113.10", "/login", 401, 45, 2),
    ]
    detections = [
        make_detection("brute_force", "High", "203.0.113.10", 4),
    ]

    campaigns = build_attack_campaigns(events, detections, build_attack_timeline(events, detections))

    assert len(campaigns) == 2
    assert all(campaign.attacker_ip == "203.0.113.10" for campaign in campaigns)
    assert campaigns[0].timeline[0].timestamp == "2026-04-09T09:00:01+00:00"
    assert campaigns[1].timeline[0].timestamp == "2026-04-09T09:45:01+00:00"
