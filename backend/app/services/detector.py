from collections import defaultdict
from collections.abc import Sequence

from app.models.log_model import Detection, ParsedEvent

SEVERITY_RANK = {
    "Low": 1,
    "Moderate": 2,
    "Medium": 3,
    "High": 4,
    "Critical": 5,
}
AUTH_ENDPOINT_PREFIXES = ("/login", "/signin", "/auth", "/wp-login.php")


def detect_suspicious_activity(events: Sequence[ParsedEvent]) -> list[Detection]:
    detections: list[Detection] = []
    detections.extend(_detect_brute_force(events))
    detections.extend(_detect_scanning(events))
    detections.extend(_detect_multi_endpoint_probe(events))

    return sorted(
        detections,
        key=lambda item: (-SEVERITY_RANK[item.severity], -item.count, item.source_ip, item.type),
    )


def _detect_brute_force(events: Sequence[ParsedEvent]) -> list[Detection]:
    grouped: dict[str, list[ParsedEvent]] = defaultdict(list)
    for event in events:
        if event.status_code in {401, 403} and _is_auth_endpoint(event.endpoint):
            grouped[event.ip].append(event)

    detections: list[Detection] = []
    for ip, ip_events in grouped.items():
        count = len(ip_events)
        if count < 5:
            continue

        severity = "Critical" if count >= 10 else "High"
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


def _detect_scanning(events: Sequence[ParsedEvent]) -> list[Detection]:
    grouped: dict[str, list[ParsedEvent]] = defaultdict(list)
    for event in events:
        if event.status_code == 404:
            grouped[event.ip].append(event)

    detections: list[Detection] = []
    for ip, ip_events in grouped.items():
        count = len(ip_events)
        if count < 10:
            continue

        severity = "High" if count >= 20 else "Medium"
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


def _detect_multi_endpoint_probe(events: Sequence[ParsedEvent]) -> list[Detection]:
    grouped: dict[str, list[ParsedEvent]] = defaultdict(list)
    for event in events:
        grouped[event.ip].append(event)

    detections: list[Detection] = []
    for ip, ip_events in grouped.items():
        distinct_endpoints = sorted({event.endpoint for event in ip_events})
        count = len(distinct_endpoints)
        if count < 8:
            continue

        severity = "High" if count >= 15 else "Moderate"
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


def _is_auth_endpoint(endpoint: str) -> bool:
    return any(endpoint.startswith(prefix) for prefix in AUTH_ENDPOINT_PREFIXES)


def _build_event_evidence(events: Sequence[ParsedEvent], limit: int = 5) -> list[str]:
    return [
        f"{event.timestamp} | {event.endpoint} | {event.status_code}"
        for event in list(events)[:limit]
    ]
