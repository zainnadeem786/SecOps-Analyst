from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.models.log_model import ParsedEvent
from app.services.query_parser import event_matches_query, parse_query


def test_parse_query_supports_combined_soc_filters() -> None:
    filters = parse_query(
        "ip:203.0.113.10 status:401 endpoint:/login "
        "from:2026-04-09T09:00:01+00:00 to:2026-04-09T09:00:05+00:00"
    )

    assert filters.ip == "203.0.113.10"
    assert filters.status_code == 401
    assert filters.endpoint_contains == "/login"
    assert filters.from_timestamp is not None
    assert filters.to_timestamp is not None


def test_parse_query_rejects_invalid_timestamps() -> None:
    with pytest.raises(HTTPException) as exc_info:
        parse_query("from:not-a-timestamp")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Invalid ISO-8601 timestamp for 'from'."


def test_event_matches_query_uses_and_semantics() -> None:
    filters = parse_query("ip:203.0.113.10 status:401 endpoint:/login")
    matching_event = ParsedEvent(
        ip="203.0.113.10",
        endpoint="/login",
        status_code=401,
        timestamp="2026-04-09T09:00:02+00:00",
    )
    non_matching_event = ParsedEvent(
        ip="203.0.113.10",
        endpoint="/admin",
        status_code=404,
        timestamp="2026-04-09T09:00:03+00:00",
    )

    assert event_matches_query(matching_event, filters) is True
    assert event_matches_query(non_matching_event, filters) is False
