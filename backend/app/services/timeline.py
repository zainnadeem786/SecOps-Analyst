"""Build a compact suspicious-activity timeline from detections and parsed events."""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from app.models.log_model import Detection, ParsedEvent, TimelineItem
from app.services.analysis_helpers import match_detection_events, parse_timestamp, sort_events
from app.services.detector import SEVERITY_RANK

TIMELINE_TITLE_MAP = {
    "brute_force": "Multiple failed login attempts",
    "scanning_fuzzing": "Endpoint scanning activity detected",
    "multi_endpoint_probe": "Suspicious multi-endpoint probing",
    "path_traversal": "Path traversal attempt detected",
    "sql_injection": "SQL injection attempt detected",
    "command_injection": "Command injection attempt detected",
    "suspicious_user_agent": "Suspicious scanner user agent detected",
    "account_compromise_suspected": "Possible account compromise detected",
}


def build_attack_timeline(events: list[ParsedEvent], detections: list[Detection]) -> list[TimelineItem]:
    """Create a chronological, detection-driven attack timeline."""

    if not events or not detections:
        return []

    sorted_events = sort_events(events)
    timeline_items = [
        _build_timeline_item(sorted_events, detection)
        for detection in detections
    ]

    return sorted(
        timeline_items,
        key=lambda item: (parse_timestamp(item.timestamp), -SEVERITY_RANK[item.severity], item.type, item.ip),
    )


def _build_timeline_item(events: Sequence[ParsedEvent], detection: Detection) -> TimelineItem:
    related_events = match_detection_events(events, detection)
    timestamp = _resolve_timestamp(events, detection, related_events)
    endpoints = _collect_distinct_endpoints(related_events)

    return TimelineItem(
        timestamp=timestamp,
        title=_build_title(detection.type),
        description=_build_description(detection, endpoints),
        severity=detection.severity,
        type=detection.type,
        ip=detection.source_ip,
    )

def _resolve_timestamp(
    events: Sequence[ParsedEvent],
    detection: Detection,
    related_events: Sequence[ParsedEvent],
) -> str:
    if related_events:
        return related_events[0].timestamp

    source_events = [event for event in events if event.ip == detection.source_ip]
    if source_events:
        return source_events[0].timestamp

    evidence_timestamp = _extract_timestamp_from_evidence(detection.evidence)
    if evidence_timestamp:
        return evidence_timestamp

    return events[0].timestamp if events else ""


def _build_title(detection_type: str) -> str:
    return TIMELINE_TITLE_MAP.get(detection_type, _humanize_detection_type(detection_type))


def _build_description(detection: Detection, endpoints: Sequence[str]) -> str:
    if detection.type == "brute_force":
        base_description = f"{detection.count} failed login attempts detected from IP {detection.source_ip}"
    elif detection.type == "scanning_fuzzing":
        base_description = f"{detection.count} suspicious not-found requests detected from IP {detection.source_ip}"
    elif detection.type == "multi_endpoint_probe":
        base_description = f"{detection.count} distinct endpoints probed by IP {detection.source_ip}"
    elif detection.type == "path_traversal":
        base_description = f"{detection.count} path traversal requests detected from IP {detection.source_ip}"
    elif detection.type == "sql_injection":
        base_description = f"{detection.count} SQL injection style requests detected from IP {detection.source_ip}"
    elif detection.type == "command_injection":
        base_description = f"{detection.count} command injection style requests detected from IP {detection.source_ip}"
    elif detection.type == "suspicious_user_agent":
        base_description = f"{detection.count} suspicious user-agent requests detected from IP {detection.source_ip}"
    elif detection.type == "account_compromise_suspected":
        base_description = f"Failed logins were followed by a successful authentication from IP {detection.source_ip}"
    else:
        base_description = detection.description

    endpoint_hint = _build_endpoint_hint(endpoints)
    if not endpoint_hint:
        return base_description
    return f"{base_description}. {endpoint_hint}"


def _build_endpoint_hint(endpoints: Sequence[str]) -> str:
    if not endpoints:
        return ""

    visible_endpoints = ", ".join(endpoints[:3])
    if len(endpoints) == 1:
        return f"Targeted endpoint: {visible_endpoints}."
    return f"Sample endpoints: {visible_endpoints}."


def _collect_distinct_endpoints(events: Iterable[ParsedEvent]) -> list[str]:
    return sorted({event.endpoint for event in events})


def _extract_timestamp_from_evidence(evidence: Sequence[str]) -> str | None:
    for item in evidence:
        timestamp, _, _ = item.partition(" | ")
        if timestamp:
            return timestamp
    return None


def _humanize_detection_type(detection_type: str) -> str:
    return detection_type.replace("_", " ").title()
