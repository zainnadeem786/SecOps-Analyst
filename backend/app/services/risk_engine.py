"""Canonical risk scoring for incident- and campaign-level analysis."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import timedelta

from app.models.log_model import Detection, ParsedEvent, RiskAssessment, RulesConfig
from app.services.analysis_helpers import is_sensitive_endpoint, match_detection_events, parse_timestamp, sort_events
from app.services.rules_service import load_rules_config

DETECTION_TYPE_POINTS = {
    "brute_force": 30,
    "scanning_fuzzing": 20,
    "multi_endpoint_probe": 25,
    "path_traversal": 25,
    "sql_injection": 30,
    "command_injection": 30,
    "suspicious_user_agent": 15,
    "account_compromise_suspected": 35,
}
SENSITIVE_ENDPOINT_POINTS = 15
HIGH_FREQUENCY_POINTS = 10
REPEATED_IP_POINTS = 10
HIGH_FREQUENCY_EVENT_THRESHOLD = 10


def calculate_risk_assessment(
    events: Sequence[ParsedEvent],
    detections: Sequence[Detection],
    *,
    include_repeated_ip_bonus: bool,
    rules: RulesConfig | None = None,
) -> RiskAssessment:
    """Calculate a canonical 0-100 risk score for a given analysis scope."""

    active_rules = rules or load_rules_config()
    score = 0
    detection_types = {detection.type for detection in detections}

    for detection_type, points in DETECTION_TYPE_POINTS.items():
        if detection_type in detection_types:
            score += points

    if any(is_sensitive_endpoint(event.endpoint) for event in events):
        score += SENSITIVE_ENDPOINT_POINTS

    suspicious_events = collect_suspicious_events(events, detections)
    if _has_high_frequency_suspicious_activity(suspicious_events, active_rules.time_window_seconds):
        score += HIGH_FREQUENCY_POINTS

    if include_repeated_ip_bonus and len({detection.source_ip for detection in detections}) >= 2:
        score += REPEATED_IP_POINTS

    capped_score = min(score, 100)
    return RiskAssessment(
        risk_score=capped_score,
        risk_level=_risk_level_for_score(capped_score),
    )


def collect_suspicious_events(events: Sequence[ParsedEvent], detections: Sequence[Detection]) -> list[ParsedEvent]:
    """Collect the related suspicious parsed events for the provided detections."""

    sorted_events = sort_events(events)
    related_events: dict[tuple[str, str, str, int], ParsedEvent] = {}
    for detection in detections:
        for event in match_detection_events(sorted_events, detection):
            related_events[(event.ip, event.timestamp, event.endpoint, event.status_code)] = event

    return sort_events(list(related_events.values()))


def _has_high_frequency_suspicious_activity(events: Sequence[ParsedEvent], time_window_seconds: int) -> bool:
    if len(events) < HIGH_FREQUENCY_EVENT_THRESHOLD:
        return False

    left = 0
    timestamps = [parse_timestamp(event.timestamp) for event in events]
    for right, current in enumerate(timestamps):
        while current - timestamps[left] > timedelta(seconds=time_window_seconds):
            left += 1
        if (right - left) + 1 >= HIGH_FREQUENCY_EVENT_THRESHOLD:
            return True

    return False


def _risk_level_for_score(score: int) -> str:
    if score <= 30:
        return "Low"
    if score <= 70:
        return "Medium"
    return "High"
