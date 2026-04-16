from __future__ import annotations

from app.db.models import CaseRecord
from app.db.repositories import build_case_reference, build_session_reference
from app.models.log_model import SearchDetectionMatch, SearchEventMatch, SearchResponse, SearchSessionMatch, UploadResponse
from app.services.analysis_helpers import match_detection_events
from app.services.query_parser import QueryFilters, event_matches_query


def build_search_response(
    *,
    case: CaseRecord,
    query: str,
    filters: QueryFilters,
    session_id: str | None = None,
) -> SearchResponse:
    matched_sessions: list[SearchSessionMatch] = []
    matched_events: list[SearchEventMatch] = []
    matched_detections: list[SearchDetectionMatch] = []

    ordered_sessions = sorted(case.upload_sessions, key=lambda item: item.uploaded_at, reverse=True)
    for record in ordered_sessions:
        if session_id and record.id != session_id:
            continue
        snapshot = UploadResponse.model_validate(record.raw_response_json)
        session_reference = build_session_reference(record)
        session_events = [event for event in snapshot.events if event_matches_query(event, filters)]
        session_detections = [
            detection
            for detection in snapshot.detections
            if any(event_matches_query(event, filters) for event in match_detection_events(snapshot.events, detection))
        ]
        if not session_events and not session_detections:
            continue

        matched_sessions.append(
            SearchSessionMatch(
                session=session_reference,
                matched_event_count=len(session_events),
                matched_detection_count=len(session_detections),
            )
        )
        matched_events.extend(
            SearchEventMatch(session=session_reference, event=event)
            for event in session_events
        )
        matched_detections.extend(
            SearchDetectionMatch(session=session_reference, detection=detection)
            for detection in session_detections
        )

    return SearchResponse(
        query=query,
        case=build_case_reference(case),
        sessions=matched_sessions,
        events=matched_events,
        detections=matched_detections,
    )
