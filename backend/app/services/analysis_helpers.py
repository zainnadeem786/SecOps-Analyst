"""Shared helpers for correlation, timeline, and risk analysis."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from app.models.log_model import Detection, ParsedEvent
from app.services.rules_service import load_rules_config

SENSITIVE_ENDPOINT_PREFIXES = (
    "/admin",
    "/wp-admin",
    "/settings",
    "/console",
    "/reports",
    "/billing",
    "/private",
    "/api",
)


def parse_timestamp(value: str) -> datetime:
    """Parse an ISO-8601 timestamp string into a datetime."""

    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def sort_events(events: Sequence[ParsedEvent]) -> list[ParsedEvent]:
    """Return parsed events in stable chronological order."""

    return sorted(events, key=lambda event: (parse_timestamp(event.timestamp), event.ip, event.endpoint))


def is_auth_endpoint(endpoint: str) -> bool:
    """Return True when the endpoint looks authentication-related."""

    rules = load_rules_config()
    return any(endpoint.startswith(prefix) for prefix in rules.auth_endpoint_prefixes)


def is_sensitive_endpoint(endpoint: str) -> bool:
    """Return True when the endpoint suggests privileged or admin access."""

    return any(endpoint.startswith(prefix) for prefix in SENSITIVE_ENDPOINT_PREFIXES)


def match_detection_events(events: Sequence[ParsedEvent], detection: Detection) -> list[ParsedEvent]:
    """Resolve the parsed events most closely associated with a detection."""

    if detection.type == "brute_force":
        matched = [
            event
            for event in events
            if event.ip == detection.source_ip and event.status_code in {401, 403} and is_auth_endpoint(event.endpoint)
        ]
    elif detection.type == "scanning_fuzzing":
        matched = [
            event
            for event in events
            if event.ip == detection.source_ip and event.status_code == 404
        ]
    elif detection.type == "multi_endpoint_probe":
        matched = [event for event in events if event.ip == detection.source_ip]
    else:
        matched = _match_events_from_evidence(events, detection)
        if not matched:
            matched = [event for event in events if event.ip == detection.source_ip]

    return sort_events(matched)


def split_events_by_gap(events: Sequence[ParsedEvent], gap_minutes: int) -> list[list[ParsedEvent]]:
    """Split sorted events into windows when the gap exceeds the configured threshold."""

    ordered = sort_events(events)
    if not ordered:
        return []

    windows: list[list[ParsedEvent]] = [[ordered[0]]]
    for event in ordered[1:]:
        if (parse_timestamp(event.timestamp) - parse_timestamp(windows[-1][-1].timestamp)).total_seconds() > gap_minutes * 60:
            windows.append([event])
        else:
            windows[-1].append(event)
    return windows


def _match_events_from_evidence(events: Sequence[ParsedEvent], detection: Detection) -> list[ParsedEvent]:
    evidence_refs = _extract_evidence_refs(detection.evidence)
    if not evidence_refs:
        return []

    matched = [
        event
        for event in events
        if (event.timestamp, event.endpoint, event.status_code) in evidence_refs
    ]
    return sort_events(matched)


def _extract_evidence_refs(evidence: Sequence[str]) -> set[tuple[str, str, int]]:
    refs: set[tuple[str, str, int]] = set()
    for item in evidence:
        parts = [part.strip() for part in item.split(" | ")]
        if len(parts) < 3:
            continue
        timestamp, endpoint, status_code = parts[:3]
        try:
            refs.add((timestamp, endpoint, int(status_code)))
        except ValueError:
            continue
    return refs
