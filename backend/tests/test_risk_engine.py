from app.models.log_model import Detection, ParsedEvent
from app.services.risk_engine import calculate_risk_assessment


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


def test_calculate_risk_assessment_applies_all_rules_and_caps_at_100() -> None:
    events = [
        make_event("203.0.113.10", "/login", 401, 0, second)
        for second in range(5)
    ] + [
        make_event("198.51.100.24", endpoint, 404, 1, index)
        for index, endpoint in enumerate(
            ["/admin", "/debug", "/backup.zip", "/wp-admin", "/api/hidden", "/private", "/console", "/old-site", "/test.php", "/staging"],
            start=1,
        )
    ] + [
        make_event("192.0.2.77", endpoint, 200, 2, index)
        for index, endpoint in enumerate(
            ["/", "/pricing", "/docs", "/admin", "/settings", "/reports", "/integrations", "/billing"],
            start=1,
        )
    ]
    detections = [
        make_detection("brute_force", "High", "203.0.113.10", 5),
        make_detection("scanning_fuzzing", "Medium", "198.51.100.24", 10),
        make_detection("multi_endpoint_probe", "Moderate", "192.0.2.77", 8),
    ]

    assessment = calculate_risk_assessment(events, detections, include_repeated_ip_bonus=True)

    assert assessment.risk_score == 100
    assert assessment.risk_level == "High"


def test_risk_level_thresholds_follow_score_ranges() -> None:
    low = calculate_risk_assessment(
        [make_event("203.0.113.10", "/login", 401, 0, 1)],
        [make_detection("brute_force", "High", "203.0.113.10", 1)],
        include_repeated_ip_bonus=False,
    )
    medium = calculate_risk_assessment(
        [
            make_event("203.0.113.10", "/login", 401, 0, 1),
            make_event("198.51.100.24", "/debug", 404, 1, 1),
        ],
        [
            make_detection("brute_force", "High", "203.0.113.10", 1),
            make_detection("scanning_fuzzing", "Medium", "198.51.100.24", 1),
        ],
        include_repeated_ip_bonus=False,
    )
    high = calculate_risk_assessment(
        [
            make_event("203.0.113.10", "/login", 401, 0, 1),
            make_event("198.51.100.24", "/debug", 404, 1, 1),
            make_event("192.0.2.77", "/docs", 200, 2, 1),
        ],
        [
            make_detection("brute_force", "High", "203.0.113.10", 1),
            make_detection("scanning_fuzzing", "Medium", "198.51.100.24", 1),
            make_detection("multi_endpoint_probe", "Moderate", "192.0.2.77", 1),
        ],
        include_repeated_ip_bonus=False,
    )

    assert (low.risk_score, low.risk_level) == (30, "Low")
    assert (medium.risk_score, medium.risk_level) == (50, "Medium")
    assert (high.risk_score, high.risk_level) == (75, "High")


def test_repeated_ip_bonus_only_applies_when_requested() -> None:
    events = [
        make_event("203.0.113.10", "/login", 401, 0, 1),
        make_event("198.51.100.24", "/debug", 404, 1, 1),
    ]
    detections = [
        make_detection("brute_force", "High", "203.0.113.10", 1),
        make_detection("scanning_fuzzing", "Medium", "198.51.100.24", 1),
    ]

    incident_assessment = calculate_risk_assessment(events, detections, include_repeated_ip_bonus=True)
    campaign_assessment = calculate_risk_assessment(events, detections, include_repeated_ip_bonus=False)

    assert incident_assessment.risk_score == 60
    assert campaign_assessment.risk_score == 50
    assert incident_assessment.risk_level == "Medium"
    assert campaign_assessment.risk_level == "Medium"


def test_new_detection_types_add_risk_points() -> None:
    events = [
        make_event("203.0.113.10", "/download", 400, 0, 1),
        make_event("203.0.113.10", "/search", 500, 0, 2),
    ]
    detections = [
        make_detection("path_traversal", "High", "203.0.113.10", 2),
        make_detection("sql_injection", "High", "203.0.113.10", 1),
    ]

    assessment = calculate_risk_assessment(events, detections, include_repeated_ip_bonus=False)

    assert assessment.risk_score == 55
    assert assessment.risk_level == "Medium"
