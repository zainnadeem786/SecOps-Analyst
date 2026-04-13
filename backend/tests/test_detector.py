import pytest

from app.models.log_model import ParsedEvent
from app.services.detector import detect_suspicious_activity


def make_event(ip: str, endpoint: str, status_code: int, second: int) -> ParsedEvent:
    return ParsedEvent(
        ip=ip,
        endpoint=endpoint,
        status_code=status_code,
        timestamp=f"2026-04-09T10:00:{second:02d}+00:00",
    )


@pytest.mark.parametrize(("count", "expected_severity"), [(5, "High"), (10, "Critical")])
def test_brute_force_thresholds(count: int, expected_severity: str) -> None:
    events = [make_event("203.0.113.10", "/login", 401, index) for index in range(count)]

    detections = detect_suspicious_activity(events)

    brute_force = next(item for item in detections if item.type == "brute_force")
    assert brute_force.severity == expected_severity
    assert brute_force.count == count


@pytest.mark.parametrize(("count", "expected_severity"), [(10, "Medium"), (20, "High")])
def test_scanning_thresholds(count: int, expected_severity: str) -> None:
    events = [make_event("198.51.100.5", f"/missing-{index}", 404, index) for index in range(count)]

    detections = detect_suspicious_activity(events)

    scanning = next(item for item in detections if item.type == "scanning_fuzzing")
    assert scanning.severity == expected_severity
    assert scanning.count == count


@pytest.mark.parametrize(("count", "expected_severity"), [(8, "Moderate"), (15, "High")])
def test_multi_endpoint_probe_thresholds(count: int, expected_severity: str) -> None:
    events = [make_event("192.0.2.77", f"/endpoint-{index}", 200, index) for index in range(count)]

    detections = detect_suspicious_activity(events)

    probe = next(item for item in detections if item.type == "multi_endpoint_probe")
    assert probe.severity == expected_severity
    assert probe.count == count


def test_detection_aggregates_per_ip_without_cross_contamination() -> None:
    events = [
        make_event("203.0.113.10", "/login", 401, 1),
        make_event("203.0.113.10", "/login", 401, 2),
        make_event("203.0.113.10", "/login", 401, 3),
        make_event("198.51.100.5", "/login", 401, 4),
        make_event("198.51.100.5", "/login", 401, 5),
        make_event("198.51.100.5", "/login", 401, 6),
        make_event("198.51.100.5", "/login", 401, 7),
    ]

    detections = detect_suspicious_activity(events)

    assert all(item.type != "brute_force" for item in detections)
