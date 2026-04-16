from app.models.log_model import Detection, ParsedEvent
from app.services.timeline import build_attack_timeline


def make_event(ip: str, endpoint: str, status_code: int, minute: int, second: int) -> ParsedEvent:
    return ParsedEvent(
        ip=ip,
        endpoint=endpoint,
        status_code=status_code,
        timestamp=f"2026-04-09T09:{minute:02d}:{second:02d}+00:00",
    )


def make_detection(
    detection_type: str,
    severity: str,
    source_ip: str,
    count: int,
    description: str,
) -> Detection:
    return Detection(
        type=detection_type,
        severity=severity,
        description=description,
        source_ip=source_ip,
        count=count,
        evidence=[],
    )


def test_build_attack_timeline_orders_and_maps_detection_steps() -> None:
    events = [
        make_event("192.0.2.77", "/docs", 200, 2, 3),
        make_event("198.51.100.24", "/admin", 404, 1, 1),
        make_event("203.0.113.10", "/login", 401, 0, 2),
        make_event("192.0.2.77", "/", 200, 2, 1),
        make_event("203.0.113.10", "/login", 401, 0, 1),
        make_event("198.51.100.24", "/debug", 404, 1, 2),
    ]
    detections = [
        make_detection("multi_endpoint_probe", "Moderate", "192.0.2.77", 8, "Reconnaissance suspected."),
        make_detection("scanning_fuzzing", "Medium", "198.51.100.24", 10, "Scanning suspected."),
        make_detection("brute_force", "High", "203.0.113.10", 5, "Brute force suspected."),
    ]

    timeline = build_attack_timeline(events, detections)

    assert [item.timestamp for item in timeline] == [
        "2026-04-09T09:00:01+00:00",
        "2026-04-09T09:01:01+00:00",
        "2026-04-09T09:02:01+00:00",
    ]
    assert [item.title for item in timeline] == [
        "Multiple failed login attempts",
        "Endpoint scanning activity detected",
        "Suspicious multi-endpoint probing",
    ]
    assert [item.ip for item in timeline] == [
        "203.0.113.10",
        "198.51.100.24",
        "192.0.2.77",
    ]
    assert [item.severity for item in timeline] == ["High", "Medium", "Moderate"]


def test_build_attack_timeline_returns_one_item_per_detection() -> None:
    events = [
        make_event("203.0.113.10", "/login", 401, 0, 1),
        make_event("203.0.113.10", "/wp-login.php", 401, 0, 2),
        make_event("198.51.100.24", "/admin", 404, 1, 1),
        make_event("198.51.100.24", "/backup.zip", 404, 1, 2),
    ]
    detections = [
        make_detection("brute_force", "High", "203.0.113.10", 5, "Brute force suspected."),
        make_detection("scanning_fuzzing", "Medium", "198.51.100.24", 10, "Scanning suspected."),
    ]

    timeline = build_attack_timeline(events, detections)

    assert len(timeline) == 2
    assert timeline[0].description == (
        "5 failed login attempts detected from IP 203.0.113.10. "
        "Sample endpoints: /login, /wp-login.php."
    )
    assert timeline[1].description == (
        "10 suspicious not-found requests detected from IP 198.51.100.24. "
        "Sample endpoints: /admin, /backup.zip."
    )


def test_build_attack_timeline_returns_empty_list_when_no_detections_exist() -> None:
    events = [make_event("203.0.113.10", "/", 200, 0, 1)]

    timeline = build_attack_timeline(events, [])

    assert timeline == []
