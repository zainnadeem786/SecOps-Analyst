from collections import defaultdict
from collections.abc import Sequence
from datetime import timedelta

from app.models.log_model import Detection, InspectedEvent, ParsedEvent, RulesConfig
from app.services.analysis_helpers import parse_timestamp
from app.services.rules_service import load_rules_config

SEVERITY_RANK = {
    "Low": 1,
    "Moderate": 2,
    "Medium": 3,
    "High": 4,
    "Critical": 5,
}

ADVANCED_DETECTION_TYPES = {
    "path_traversal",
    "sql_injection",
    "command_injection",
    "suspicious_user_agent",
    "account_compromise_suspected",
}


def detect_suspicious_activity(
    events: Sequence[ParsedEvent],
    rules: RulesConfig | None = None,
    inspected_events: Sequence[InspectedEvent] | None = None,
) -> list[Detection]:
    active_rules = rules or load_rules_config()
    inspections = list(inspected_events or (_build_fallback_inspection(event) for event in events))
    detections: list[Detection] = []
    brute_force_detections = _detect_brute_force(events, active_rules)
    detections.extend(brute_force_detections)

    scanning_detections = _detect_scanning(events, active_rules)
    detections.extend(scanning_detections)
    detections.extend(
        _detect_multi_endpoint_probe(
            events,
            active_rules,
            excluded_ips={detection.source_ip for detection in scanning_detections},
        )
    )
    detections.extend(_detect_path_traversal(inspections, active_rules))
    detections.extend(_detect_sql_injection(inspections, active_rules))
    detections.extend(_detect_command_injection(inspections, active_rules))
    detections.extend(_detect_suspicious_user_agents(inspections, active_rules))
    detections.extend(_detect_account_compromise(inspections, active_rules))

    return sorted(
        detections,
        key=lambda item: (-SEVERITY_RANK[item.severity], -item.count, item.source_ip, item.type),
    )


def _detect_brute_force(events: Sequence[ParsedEvent], rules: RulesConfig) -> list[Detection]:
    grouped: dict[str, list[ParsedEvent]] = defaultdict(list)
    for event in events:
        if event.status_code in {401, 403} and _is_auth_endpoint(event.endpoint, rules.auth_endpoint_prefixes):
            grouped[event.ip].append(event)

    detections: list[Detection] = []
    for ip, ip_events in grouped.items():
        count = len(ip_events)
        if count < rules.brute_force_threshold:
            continue

        severity = "Critical" if count >= rules.brute_force_critical_threshold else "High"
        detections.append(
            Detection(
                type="brute_force",
                severity=severity,
                description=(
                    f"Source IP {ip} generated {count} failed authentication attempts "
                    "against login-related endpoints."
                ),
                source_ip=ip,
                count=count,
                evidence=_build_event_evidence(ip_events),
            )
        )

    return detections


def _detect_scanning(events: Sequence[ParsedEvent], rules: RulesConfig) -> list[Detection]:
    grouped: dict[str, list[ParsedEvent]] = defaultdict(list)
    for event in events:
        if event.status_code == 404:
            grouped[event.ip].append(event)

    detections: list[Detection] = []
    for ip, ip_events in grouped.items():
        count = len(ip_events)
        if count < rules.scan_threshold:
            continue

        severity = "High" if count >= rules.scan_high_threshold else "Medium"
        detections.append(
            Detection(
                type="scanning_fuzzing",
                severity=severity,
                description=(
                    f"Source IP {ip} triggered {count} not-found responses, which is "
                    "consistent with scanning or fuzzing behavior."
                ),
                source_ip=ip,
                count=count,
                evidence=_build_event_evidence(ip_events),
            )
        )

    return detections


def _detect_multi_endpoint_probe(
    events: Sequence[ParsedEvent],
    rules: RulesConfig,
    excluded_ips: set[str] | None = None,
) -> list[Detection]:
    grouped: dict[str, list[ParsedEvent]] = defaultdict(list)
    excluded_ips = excluded_ips or set()
    for event in events:
        if event.ip in excluded_ips:
            continue
        grouped[event.ip].append(event)

    detections: list[Detection] = []
    for ip, ip_events in grouped.items():
        distinct_endpoints = sorted({event.endpoint for event in ip_events})
        count = len(distinct_endpoints)
        if count < rules.probe_threshold:
            continue

        severity = "High" if count >= rules.probe_high_threshold else "Moderate"
        detections.append(
            Detection(
                type="multi_endpoint_probe",
                severity=severity,
                description=(
                    f"Source IP {ip} accessed {count} distinct endpoints in a single upload, "
                    "which may indicate reconnaissance or automated probing."
                ),
                source_ip=ip,
                count=count,
                evidence=distinct_endpoints[:5],
            )
        )

    return detections


def _detect_path_traversal(inspections: Sequence[InspectedEvent], rules: RulesConfig) -> list[Detection]:
    grouped: dict[str, list[InspectedEvent]] = defaultdict(list)
    lower_patterns = [pattern.lower() for pattern in rules.path_traversal_patterns]
    lower_sensitive_targets = [target.lower() for target in rules.path_traversal_sensitive_targets]

    for inspection in inspections:
        haystacks = _inspection_haystacks(inspection)
        has_pattern = any(pattern in haystack for haystack in haystacks for pattern in lower_patterns)
        has_sensitive_target = any(target in haystack for haystack in haystacks for target in lower_sensitive_targets)
        if has_pattern or has_sensitive_target:
            grouped[inspection.ip].append(inspection)

    detections: list[Detection] = []
    for ip, ip_events in grouped.items():
        count = len(ip_events)
        if count < rules.path_traversal_threshold:
            continue

        touched_sensitive_target = any(
            target.lower() in haystack
            for inspection in ip_events
            for haystack in _inspection_haystacks(inspection)
            for target in rules.path_traversal_sensitive_targets
        )
        severity = "Critical" if touched_sensitive_target or count >= rules.path_traversal_critical_threshold else "High"
        detections.append(
            Detection(
                type="path_traversal",
                severity=severity,
                description=(
                    f"Source IP {ip} requested {count} traversal-style paths, including attempts to reach "
                    "sensitive filesystem targets."
                    if touched_sensitive_target
                    else f"Source IP {ip} generated {count} path traversal style requests."
                ),
                source_ip=ip,
                count=count,
                evidence=_build_inspection_evidence(ip_events),
            )
        )

    return detections


def _detect_sql_injection(inspections: Sequence[InspectedEvent], rules: RulesConfig) -> list[Detection]:
    return _detect_pattern_family(
        inspections,
        detection_type="sql_injection",
        threshold=rules.sql_injection_threshold,
        critical_threshold=rules.sql_injection_critical_threshold,
        patterns=rules.sql_injection_patterns,
        description_factory=lambda ip, count: f"Source IP {ip} generated {count} SQL injection style requests.",
    )


def _detect_command_injection(inspections: Sequence[InspectedEvent], rules: RulesConfig) -> list[Detection]:
    return _detect_pattern_family(
        inspections,
        detection_type="command_injection",
        threshold=rules.command_injection_threshold,
        critical_threshold=rules.command_injection_critical_threshold,
        patterns=rules.command_injection_patterns,
        description_factory=lambda ip, count: f"Source IP {ip} generated {count} command injection style requests.",
    )


def _detect_pattern_family(
    inspections: Sequence[InspectedEvent],
    *,
    detection_type: str,
    threshold: int,
    critical_threshold: int,
    patterns: Sequence[str],
    description_factory,
) -> list[Detection]:
    grouped: dict[str, list[InspectedEvent]] = defaultdict(list)
    lower_patterns = [pattern.lower() for pattern in patterns]

    for inspection in inspections:
        haystacks = [
            inspection.decoded_request_target.lower(),
            inspection.decoded_query_string.lower(),
            (inspection.request_body or "").lower(),
        ]
        if any(pattern in haystack for haystack in haystacks for pattern in lower_patterns):
            grouped[inspection.ip].append(inspection)

    detections: list[Detection] = []
    for ip, ip_events in grouped.items():
        count = len(ip_events)
        if count < threshold:
            continue

        severity = "Critical" if count >= critical_threshold else "High"
        detections.append(
            Detection(
                type=detection_type,
                severity=severity,
                description=description_factory(ip, count),
                source_ip=ip,
                count=count,
                evidence=_build_inspection_evidence(ip_events),
            )
        )
    return detections


def _detect_suspicious_user_agents(inspections: Sequence[InspectedEvent], rules: RulesConfig) -> list[Detection]:
    grouped: dict[str, list[tuple[InspectedEvent, set[str]]]] = defaultdict(list)
    signatures = [signature.lower() for signature in rules.suspicious_user_agent_signatures]
    immediate_signatures = {signature.lower() for signature in rules.suspicious_user_agent_immediate_signatures}

    for inspection in inspections:
        user_agent = inspection.user_agent.lower()
        if not user_agent:
            continue
        matched = {signature for signature in signatures if signature in user_agent}
        if matched:
            grouped[inspection.ip].append((inspection, matched))

    detections: list[Detection] = []
    for ip, matched_events in grouped.items():
        count = len(matched_events)
        combined_signatures = sorted({signature for _, signatures_set in matched_events for signature in signatures_set})
        has_immediate_signature = any(signature in immediate_signatures for signature in combined_signatures)
        effective_threshold = 1 if has_immediate_signature else rules.suspicious_user_agent_threshold
        if count < effective_threshold:
            continue

        severity = "Critical" if has_immediate_signature or count >= rules.suspicious_user_agent_critical_threshold else "High"
        evidence_events = [inspection for inspection, _ in matched_events]
        detections.append(
            Detection(
                type="suspicious_user_agent",
                severity=severity,
                description=(
                    f"Source IP {ip} used suspicious user agents associated with {', '.join(combined_signatures[:3])}."
                ),
                source_ip=ip,
                count=count,
                evidence=_build_inspection_evidence(evidence_events, include_user_agent=True),
            )
        )

    return detections


def _detect_account_compromise(inspections: Sequence[InspectedEvent], rules: RulesConfig) -> list[Detection]:
    grouped: dict[str, list[InspectedEvent]] = defaultdict(list)
    for inspection in inspections:
        if _is_auth_endpoint(inspection.endpoint, rules.auth_endpoint_prefixes):
            grouped[inspection.ip].append(inspection)

    detections: list[Detection] = []
    for ip, ip_events in grouped.items():
        ordered = sorted(ip_events, key=lambda item: parse_timestamp(item.timestamp))
        for index, event in enumerate(ordered):
            if event.status_code not in rules.compromise_success_status_codes:
                continue

            current_timestamp = parse_timestamp(event.timestamp)
            failures = [
                candidate
                for candidate in ordered[:index]
                if candidate.status_code in {401, 403}
                and current_timestamp - parse_timestamp(candidate.timestamp) <= timedelta(seconds=rules.compromise_success_window_seconds)
            ]
            if len(failures) < rules.compromise_failure_threshold:
                continue

            evidence_events = failures[-5:] + [event]
            detections.append(
                Detection(
                    type="account_compromise_suspected",
                    severity="Critical",
                    description=(
                        f"Source IP {ip} recorded {len(failures)} failed logins followed by a successful authentication response."
                    ),
                    source_ip=ip,
                    count=len(failures) + 1,
                    evidence=_build_inspection_evidence(evidence_events),
                )
            )
            break

    return detections


def _inspection_haystacks(inspection: InspectedEvent) -> list[str]:
    return [
        inspection.request_target.lower(),
        inspection.decoded_request_target.lower(),
        inspection.query_string.lower(),
        inspection.decoded_query_string.lower(),
        (inspection.request_body or "").lower(),
    ]


def _is_auth_endpoint(endpoint: str, auth_prefixes: Sequence[str]) -> bool:
    return any(endpoint.startswith(prefix) for prefix in auth_prefixes)


def _build_event_evidence(events: Sequence[ParsedEvent], limit: int = 5) -> list[str]:
    return [
        f"{event.timestamp} | {event.endpoint} | {event.status_code}"
        for event in list(events)[:limit]
    ]


def _build_inspection_evidence(
    inspections: Sequence[InspectedEvent],
    *,
    limit: int = 5,
    include_user_agent: bool = False,
) -> list[str]:
    evidence: list[str] = []
    for inspection in list(inspections)[:limit]:
        item = f"{inspection.timestamp} | {inspection.endpoint} | {inspection.status_code} | {inspection.request_target}"
        if include_user_agent and inspection.user_agent:
            item = f"{item} | {inspection.user_agent}"
        evidence.append(item)
    return evidence


def _build_fallback_inspection(event: ParsedEvent) -> InspectedEvent:
    return InspectedEvent(
        ip=event.ip,
        endpoint=event.endpoint,
        status_code=event.status_code,
        timestamp=event.timestamp,
        method="GET",
        request_target=event.endpoint,
        decoded_request_target=event.endpoint,
        query_string="",
        decoded_query_string="",
        user_agent="",
        raw_line=f"{event.ip} {event.endpoint} {event.status_code} {event.timestamp}",
    )
