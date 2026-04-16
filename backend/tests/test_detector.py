import pytest

from app.models.log_model import InspectedEvent, ParsedEvent
from app.services.detector import detect_suspicious_activity


def make_event(ip: str, endpoint: str, status_code: int, second: int) -> ParsedEvent:
    return ParsedEvent(
        ip=ip,
        endpoint=endpoint,
        status_code=status_code,
        timestamp=f"2026-04-09T10:00:{second:02d}+00:00",
    )


def make_inspected_event(
    ip: str,
    request_target: str,
    status_code: int,
    second: int,
    *,
    method: str = "GET",
    user_agent: str = "Mozilla/5.0",
    request_body: str | None = None,
) -> InspectedEvent:
    endpoint = request_target.split("?", maxsplit=1)[0]
    query_string = request_target.split("?", maxsplit=1)[1] if "?" in request_target else ""
    return InspectedEvent(
        ip=ip,
        endpoint=endpoint,
        status_code=status_code,
        timestamp=f"2026-04-09T10:00:{second:02d}+00:00",
        method=method,
        request_target=request_target,
        decoded_request_target=request_target,
        query_string=query_string,
        decoded_query_string=query_string,
        user_agent=user_agent,
        raw_line=request_target,
        request_body=request_body,
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


def test_multi_endpoint_probe_is_suppressed_when_scanning_already_covers_the_ip() -> None:
    events = [make_event("198.51.100.5", f"/missing-{index}", 404, index) for index in range(10)]

    detections = detect_suspicious_activity(events)

    assert {(item.type, item.source_ip) for item in detections} == {
        ("scanning_fuzzing", "198.51.100.5"),
    }


def test_path_traversal_detection_matches_sensitive_targets() -> None:
    inspected_events = [
        make_inspected_event("203.0.113.50", "/download?file=../../etc/passwd", 400, 1),
        make_inspected_event("203.0.113.50", "/download?file=%2e%2e/%2e%2e/windows/system32", 403, 2),
    ]

    detections = detect_suspicious_activity([], inspected_events=inspected_events)

    traversal = next(item for item in detections if item.type == "path_traversal")
    assert traversal.source_ip == "203.0.113.50"
    assert traversal.severity == "Critical"
    assert traversal.count == 2


def test_sql_injection_and_command_injection_detection_match_query_and_body() -> None:
    inspected_events = [
        make_inspected_event("198.51.100.90", "/search?q=' OR '1'='1", 500, 1),
        make_inspected_event(
            "198.51.100.90",
            "/submit",
            500,
            2,
            method="POST",
            request_body="name=test; whoami",
        ),
    ]

    detections = detect_suspicious_activity([], inspected_events=inspected_events)

    assert {item.type for item in detections} >= {"sql_injection", "command_injection"}


def test_suspicious_user_agents_are_aggregated_per_ip() -> None:
    inspected_events = [
        make_inspected_event("198.51.100.91", "/admin", 404, 1, user_agent="sqlmap/1.7"),
        make_inspected_event("198.51.100.91", "/config", 404, 2, user_agent="sqlmap/1.7"),
    ]

    detections = detect_suspicious_activity([], inspected_events=inspected_events)

    scanner = next(item for item in detections if item.type == "suspicious_user_agent")
    assert scanner.severity == "Critical"
    assert scanner.count == 2


def test_account_compromise_detection_links_failed_logins_to_success() -> None:
    events = [
        make_event("203.0.113.120", "/login", 401, 1),
        make_event("203.0.113.120", "/login", 401, 2),
        make_event("203.0.113.120", "/login", 401, 3),
        make_event("203.0.113.120", "/login", 401, 4),
        make_event("203.0.113.120", "/login", 401, 5),
        make_event("203.0.113.120", "/login", 200, 6),
    ]

    detections = detect_suspicious_activity(events)

    compromise = next(item for item in detections if item.type == "account_compromise_suspected")
    assert compromise.severity == "Critical"
    assert compromise.source_ip == "203.0.113.120"
