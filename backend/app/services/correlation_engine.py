"""Group detections and events into attack campaigns."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

from app.models.log_model import AttackCampaign, CampaignEventSummary, CampaignPhase, Detection, ParsedEvent, RulesConfig, TimelineItem
from app.services.analysis_helpers import is_sensitive_endpoint, match_detection_events, parse_timestamp, sort_events, split_events_by_gap
from app.services.detector import SEVERITY_RANK
from app.services.risk_engine import calculate_risk_assessment
from app.services.rules_service import load_rules_config
from app.services.timeline import build_attack_timeline

PHASE_ORDER = (
    "Reconnaissance",
    "Scanning",
    "Credential Attacks",
    "Exploitation",
    "Lateral Movement Hint",
    "Impact",
)


def build_attack_campaigns(
    events: list[ParsedEvent],
    detections: list[Detection],
    timeline: list[TimelineItem],
    rules: RulesConfig | None = None,
    *,
    strict_window_thresholds: bool = False,
) -> list[AttackCampaign]:
    """Build attack campaigns per suspicious IP, split by time-window gaps."""

    if not detections:
        return []

    active_rules = rules or load_rules_config()
    sorted_events = sort_events(events)
    detections_by_ip: dict[str, list[Detection]] = defaultdict(list)
    for detection in detections:
        detections_by_ip[detection.source_ip].append(detection)

    campaigns: list[AttackCampaign] = []
    for attacker_ip, ip_detections in detections_by_ip.items():
        ip_events = [event for event in sorted_events if event.ip == attacker_ip]
        if not ip_events:
            continue

        for window_events in split_events_by_gap(ip_events, active_rules.campaign_gap_minutes):
            window_detections = _build_window_detections(
                window_events,
                ip_detections,
                active_rules,
                strict_thresholds=strict_window_thresholds,
            )
            if not window_detections:
                continue
            campaigns.append(_build_campaign(attacker_ip, window_events, window_detections, active_rules))

    return sorted(
        campaigns,
        key=lambda campaign: (
            _campaign_sort_timestamp(campaign),
            -campaign.risk_score,
            campaign.attacker_ip,
            campaign.campaign_name,
        ),
    )


def _build_campaign(
    attacker_ip: str,
    events: Sequence[ParsedEvent],
    detections: Sequence[Detection],
    rules: RulesConfig,
) -> AttackCampaign:
    phases = _build_phases(events, detections)
    local_timeline = build_attack_timeline(list(events), list(detections))
    risk_assessment = calculate_risk_assessment(events, detections, include_repeated_ip_bonus=False, rules=rules)

    return AttackCampaign(
        attacker_ip=attacker_ip,
        campaign_name=_campaign_name_for_phases(phases),
        phases=phases,
        severity=max(detections, key=lambda detection: SEVERITY_RANK[detection.severity]).severity,
        risk_score=risk_assessment.risk_score,
        risk_level=risk_assessment.risk_level,
        timeline=local_timeline,
    )


def _build_window_detections(
    window_events: Sequence[ParsedEvent],
    detections: Sequence[Detection],
    rules: RulesConfig,
    *,
    strict_thresholds: bool,
) -> list[Detection]:
    event_refs = {(event.timestamp, event.endpoint, event.status_code) for event in window_events}
    localized: list[Detection] = []
    for detection in detections:
        related_events = [
            event
            for event in match_detection_events(window_events, detection)
            if (event.timestamp, event.endpoint, event.status_code) in event_refs
        ]
        if not related_events and detection.type != "multi_endpoint_probe":
            continue

        localized_detection = _localize_detection(detection, related_events, rules, strict_thresholds)
        if localized_detection is not None:
            localized.append(localized_detection)
    return localized


def _localize_detection(
    detection: Detection,
    related_events: Sequence[ParsedEvent],
    rules: RulesConfig,
    strict_thresholds: bool,
) -> Detection | None:
    if detection.type == "multi_endpoint_probe":
        count = len({event.endpoint for event in related_events})
    elif detection.type == "account_compromise_suspected":
        count = len(related_events) if related_events else detection.count
    else:
        count = len(related_events)

    if count == 0:
        return None

    threshold = _threshold_for_detection_type(detection.type, rules)
    if strict_thresholds and threshold is not None and count < threshold:
        return None

    severity = _severity_for_window_detection(detection.type, count, rules, fallback=detection.severity)
    description = _description_for_window_detection(detection, count)
    evidence = _window_evidence(detection, related_events)
    return Detection(
        type=detection.type,
        severity=severity,
        description=description,
        source_ip=detection.source_ip,
        count=count,
        evidence=evidence,
        geo=detection.geo,
    )


def _build_phases(events: Sequence[ParsedEvent], detections: Sequence[Detection]) -> list[CampaignPhase]:
    phase_events: dict[str, list[CampaignEventSummary]] = {phase: [] for phase in PHASE_ORDER}

    for detection in detections:
        related_events = match_detection_events(events, detection)
        if detection.type == "scanning_fuzzing":
            phase_events["Scanning"].extend(
                _build_event_summaries(
                    _compact_events_by_endpoint(related_events, limit=5),
                    detection.type,
                    title="Scanning request",
                    description_factory=lambda event: f"Not-found response returned for probed endpoint {event.endpoint}.",
                )
            )
        elif detection.type == "brute_force":
            phase_events["Credential Attacks"].extend(
                _build_event_summaries(
                    related_events[:5],
                    detection.type,
                    title="Failed login attempt",
                    description_factory=lambda event: f"Authentication attempt against {event.endpoint} failed with status {event.status_code}.",
                )
            )
        elif detection.type == "multi_endpoint_probe":
            phase_events["Reconnaissance"].extend(
                _build_event_summaries(
                    _compact_events_by_endpoint(related_events, limit=5),
                    detection.type,
                    title="Endpoint probe",
                    description_factory=lambda event: f"Distinct endpoint {event.endpoint} was accessed during reconnaissance activity.",
                )
            )
            sensitive_events = [event for event in related_events if is_sensitive_endpoint(event.endpoint)]
            if sensitive_events:
                phase_events["Lateral Movement Hint"].extend(
                    _build_event_summaries(
                        _compact_events_by_endpoint(sensitive_events, limit=3),
                        detection.type,
                        title="Sensitive endpoint touched",
                        description_factory=lambda event: f"Reconnaissance reached sensitive path {event.endpoint}, suggesting deeper access interest.",
                    )
                )
        elif detection.type in {"path_traversal", "sql_injection", "command_injection"}:
            phase_events["Exploitation"].extend(
                _build_event_summaries(
                    related_events[:5],
                    detection.type,
                    title=_phase_title_for_detection(detection.type),
                    description_factory=lambda event: f"Exploit-style request targeted {event.endpoint} and returned status {event.status_code}.",
                )
            )
        elif detection.type == "suspicious_user_agent":
            phase_events["Scanning"].extend(
                _build_event_summaries(
                    related_events[:5],
                    detection.type,
                    title="Suspicious client signature",
                    description_factory=lambda event: f"Scanner-style user agent was observed while requesting {event.endpoint}.",
                )
            )
        elif detection.type == "account_compromise_suspected":
            phase_events["Impact"].extend(
                _build_event_summaries(
                    related_events[:5],
                    detection.type,
                    title="Authentication success after failures",
                    description_factory=lambda event: f"Suspicious login sequence included a successful response for {event.endpoint}.",
                )
            )

    return [
        CampaignPhase(
            phase=phase,
            events=_deduplicate_phase_events(phase_events[phase]),
        )
        for phase in PHASE_ORDER
    ]


def _compact_events_by_endpoint(events: Sequence[ParsedEvent], limit: int) -> list[ParsedEvent]:
    compacted: list[ParsedEvent] = []
    seen_endpoints: set[str] = set()
    for event in sort_events(events):
        if event.endpoint in seen_endpoints:
            continue
        seen_endpoints.add(event.endpoint)
        compacted.append(event)
        if len(compacted) >= limit:
            break
    return compacted


def _build_event_summaries(
    events: Sequence[ParsedEvent],
    detection_type: str,
    *,
    title: str,
    description_factory,
) -> list[CampaignEventSummary]:
    return [
        CampaignEventSummary(
            timestamp=event.timestamp,
            title=title,
            description=description_factory(event),
            endpoint=event.endpoint,
            status_code=event.status_code,
            detection_type=detection_type,
        )
        for event in events
    ]


def _deduplicate_phase_events(events: Sequence[CampaignEventSummary]) -> list[CampaignEventSummary]:
    deduplicated: dict[tuple[str, str, int, str], CampaignEventSummary] = {}
    for event in events:
        deduplicated[(event.timestamp, event.endpoint, event.status_code, event.detection_type)] = event
    return sorted(deduplicated.values(), key=lambda event: (parse_timestamp(event.timestamp), event.endpoint, event.status_code))


def _campaign_name_for_phases(phases: Sequence[CampaignPhase]) -> str:
    populated_phases = [phase.phase for phase in phases if phase.events]
    if len(populated_phases) >= 2:
        return "Suspicious Multi-Stage Attack"
    if populated_phases == ["Credential Attacks"]:
        return "Credential Attack Campaign"
    if populated_phases and all(phase in {"Reconnaissance", "Scanning"} for phase in populated_phases):
        return "Reconnaissance Campaign"
    return "Suspicious Activity Campaign"


def _campaign_sort_timestamp(campaign: AttackCampaign):
    for item in campaign.timeline:
        return parse_timestamp(item.timestamp)

    for phase in campaign.phases:
        if phase.events:
            return parse_timestamp(phase.events[0].timestamp)

    return parse_timestamp("1970-01-01T00:00:00+00:00")


def _threshold_for_detection_type(detection_type: str, rules: RulesConfig) -> int | None:
    return {
        "brute_force": rules.brute_force_threshold,
        "scanning_fuzzing": rules.scan_threshold,
        "multi_endpoint_probe": rules.probe_threshold,
        "path_traversal": rules.path_traversal_threshold,
        "sql_injection": rules.sql_injection_threshold,
        "command_injection": rules.command_injection_threshold,
        "suspicious_user_agent": rules.suspicious_user_agent_threshold,
        "account_compromise_suspected": rules.compromise_failure_threshold + 1,
    }.get(detection_type)


def _severity_for_window_detection(
    detection_type: str,
    count: int,
    rules: RulesConfig,
    *,
    fallback: str,
) -> str:
    if detection_type == "brute_force":
        return "Critical" if count >= rules.brute_force_critical_threshold else "High"
    if detection_type == "scanning_fuzzing":
        return "High" if count >= rules.scan_high_threshold else "Medium"
    if detection_type == "multi_endpoint_probe":
        return "High" if count >= rules.probe_high_threshold else "Moderate"
    if detection_type == "path_traversal":
        return "Critical" if count >= rules.path_traversal_critical_threshold else "High"
    if detection_type == "sql_injection":
        return "Critical" if count >= rules.sql_injection_critical_threshold else "High"
    if detection_type == "command_injection":
        return "Critical" if count >= rules.command_injection_critical_threshold else "High"
    if detection_type == "suspicious_user_agent":
        return "Critical" if count >= rules.suspicious_user_agent_critical_threshold else "High"
    if detection_type == "account_compromise_suspected":
        return "Critical"
    return fallback


def _description_for_window_detection(detection: Detection, count: int) -> str:
    if detection.type == "multi_endpoint_probe":
        return f"Source IP {detection.source_ip} accessed {count} distinct endpoints during this campaign window."
    if detection.type == "account_compromise_suspected":
        return f"Source IP {detection.source_ip} showed repeated failed logins followed by a successful authentication in this window."
    if detection.type == "scanning_fuzzing":
        return f"Source IP {detection.source_ip} triggered {count} not-found responses during this campaign window."
    if detection.type == "brute_force":
        return f"Source IP {detection.source_ip} generated {count} failed authentication attempts in this campaign window."
    return detection.description


def _window_evidence(detection: Detection, related_events: Sequence[ParsedEvent]) -> list[str]:
    if detection.type == "multi_endpoint_probe":
        return sorted({event.endpoint for event in related_events})[:5] if related_events else detection.evidence[:5]
    if related_events:
        return [f"{event.timestamp} | {event.endpoint} | {event.status_code}" for event in list(related_events)[:5]]
    return detection.evidence[:5]


def _phase_title_for_detection(detection_type: str) -> str:
    return {
        "path_traversal": "Path traversal attempt",
        "sql_injection": "SQL injection attempt",
        "command_injection": "Command injection attempt",
    }.get(detection_type, detection_type.replace("_", " ").title())
