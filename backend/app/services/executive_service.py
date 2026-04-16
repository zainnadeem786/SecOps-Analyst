from __future__ import annotations

from collections import Counter, defaultdict

from app.db.models import CaseRecord
from app.models.log_model import ExecutiveCountryStat, ExecutiveRiskTrendPoint, ExecutiveSummary, UploadResponse


def build_executive_summary(cases: list[CaseRecord]) -> ExecutiveSummary:
    total_sessions = 0
    total_risk = 0
    country_counter: Counter[str] = Counter()
    risk_by_day: dict[str, list[int]] = defaultdict(list)

    for case in cases:
        for upload_session in case.upload_sessions:
            snapshot = UploadResponse.model_validate(upload_session.raw_response_json)
            total_sessions += 1
            total_risk += upload_session.risk_score
            risk_by_day[upload_session.uploaded_at.date().isoformat()].append(upload_session.risk_score)
            for detection in snapshot.detections:
                if detection.geo and detection.geo.country:
                    country_counter[detection.geo.country] += 1

    average_risk = round(total_risk / total_sessions, 1) if total_sessions else 0.0
    top_countries = [
        ExecutiveCountryStat(country=country, count=count)
        for country, count in country_counter.most_common(5)
    ]
    risk_trend = [
        ExecutiveRiskTrendPoint(
            day=day,
            average_risk_score=round(sum(scores) / len(scores), 1),
            session_count=len(scores),
        )
        for day, scores in sorted(risk_by_day.items())
    ]

    return ExecutiveSummary(
        total_incidents=len(cases),
        total_sessions=total_sessions,
        average_risk_score=average_risk,
        top_attacker_countries=top_countries,
        risk_trend=risk_trend,
    )
