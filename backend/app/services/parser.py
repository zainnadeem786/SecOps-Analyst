import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import unquote_plus, urlsplit

from app.models.log_model import InspectedEvent, ParsedEvent

logger = logging.getLogger(__name__)

LOG_PATTERN = re.compile(
    r'^(?P<ip>\S+)\s+\S+\s+\S+\s+\[(?P<timestamp>[^\]]+)\]\s+"(?P<method>[A-Z]+)\s+(?P<request_target>\S+)(?:\s+HTTP/\d\.\d)?"\s+(?P<status>\d{3})\s+\S+(?:\s+"(?P<referrer>[^"]*)"\s+"(?P<user_agent>[^"]*)")?$'
)

TIMESTAMP_FORMATS = (
    "%d/%b/%Y:%H:%M:%S %z",
    "%d/%b/%Y:%H:%M:%S",
)


@dataclass(slots=True)
class ParseResult:
    events: list[ParsedEvent]
    inspected_events: list[InspectedEvent]
    skipped_lines: int
    total_lines: int


def parse_log_content(raw_content: str) -> ParseResult:
    events: list[ParsedEvent] = []
    inspected_events: list[InspectedEvent] = []
    skipped_lines = 0
    total_lines = 0

    for raw_line in raw_content.splitlines():
        line = raw_line.lstrip("\ufeff").strip()
        if not line:
            continue

        total_lines += 1
        match = LOG_PATTERN.match(line)
        if not match:
            skipped_lines += 1
            continue

        timestamp = _parse_timestamp(match.group("timestamp"))
        if timestamp is None:
            skipped_lines += 1
            continue

        request_target = match.group("request_target")
        parsed_event = ParsedEvent(
            ip=match.group("ip"),
            endpoint=_normalise_endpoint(request_target),
            status_code=int(match.group("status")),
            timestamp=timestamp,
        )
        events.append(parsed_event)
        inspected_events.append(
            InspectedEvent(
                ip=parsed_event.ip,
                endpoint=parsed_event.endpoint,
                status_code=parsed_event.status_code,
                timestamp=parsed_event.timestamp,
                method=match.group("method"),
                request_target=request_target,
                decoded_request_target=_decode_request_target(request_target),
                query_string=_extract_query_string(request_target),
                decoded_query_string=_decode_request_target(_extract_query_string(request_target)),
                user_agent=(match.group("user_agent") or "").strip(),
                raw_line=line,
            )
        )

    if skipped_lines:
        logger.info("Skipped %s of %s log lines that did not match the parser.", skipped_lines, total_lines)

    return ParseResult(
        events=events,
        inspected_events=inspected_events,
        skipped_lines=skipped_lines,
        total_lines=total_lines,
    )


def _parse_timestamp(value: str) -> str | None:
    for timestamp_format in TIMESTAMP_FORMATS:
        try:
            parsed = datetime.strptime(value, timestamp_format)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return parsed.isoformat()
        except ValueError:
            continue
    return None


def _normalise_endpoint(request_target: str) -> str:
    if request_target in {"*", "-"}:
        return "/"

    parsed_target = urlsplit(request_target)
    endpoint = parsed_target.path or request_target.split("?", maxsplit=1)[0]
    return endpoint or "/"


def _extract_query_string(request_target: str) -> str:
    return urlsplit(request_target).query


def _decode_request_target(value: str) -> str:
    return unquote_plus(value or "")
