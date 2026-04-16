from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status

from app.models.log_model import ParsedEvent


@dataclass(slots=True)
class QueryFilters:
    ip: str | None = None
    status_code: int | None = None
    endpoint_contains: str | None = None
    from_timestamp: datetime | None = None
    to_timestamp: datetime | None = None


def parse_query(query: str) -> QueryFilters:
    filters = QueryFilters()
    for raw_token in query.split():
        token = raw_token.strip()
        if not token:
            continue
        if ":" not in token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported search token '{token}'.",
            )
        key, value = token.split(":", maxsplit=1)
        value = value.strip()
        key = key.strip().lower()
        if not value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Missing value for '{key}'.")
        if key == "ip":
            filters.ip = value
        elif key == "status":
            try:
                filters.status_code = int(value)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Status filter must be an integer.",
                ) from exc
        elif key == "endpoint":
            filters.endpoint_contains = value.lower()
        elif key == "from":
            filters.from_timestamp = _parse_timestamp(value, "from")
        elif key == "to":
            filters.to_timestamp = _parse_timestamp(value, "to")
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported search key '{key}'.",
            )
    return filters


def event_matches_query(event: ParsedEvent, filters: QueryFilters) -> bool:
    event_timestamp = _parse_timestamp(event.timestamp, "timestamp")
    if filters.ip and event.ip != filters.ip:
        return False
    if filters.status_code is not None and event.status_code != filters.status_code:
        return False
    if filters.endpoint_contains and filters.endpoint_contains not in event.endpoint.lower():
        return False
    if filters.from_timestamp and event_timestamp < filters.from_timestamp:
        return False
    if filters.to_timestamp and event_timestamp > filters.to_timestamp:
        return False
    return True


def _parse_timestamp(value: str, label: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ISO-8601 timestamp for '{label}'.",
        ) from exc
