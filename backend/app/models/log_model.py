from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Severity = Literal["Low", "Moderate", "Medium", "High", "Critical"]
RiskLevel = Literal["Low", "Medium", "High", "Critical"]
CanonicalRiskLevel = Literal["Low", "Medium", "High"]
SessionSourceType = Literal["upload", "live_stream"]
APIKeyScope = Literal["read", "ingest"]


class GeoLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ip: str
    country: str
    lat: float
    lon: float


class ParsedEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ip: str = Field(..., description="Source IP address.")
    endpoint: str = Field(..., description="Normalized request path.")
    status_code: int = Field(..., ge=100, le=599)
    timestamp: str = Field(..., description="ISO-8601 timestamp string.")


class InspectedEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ip: str
    endpoint: str
    status_code: int = Field(..., ge=100, le=599)
    timestamp: str
    method: str
    request_target: str
    decoded_request_target: str
    query_string: str = ""
    decoded_query_string: str = ""
    user_agent: str = ""
    raw_line: str
    request_body: str | None = None


class Detection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    severity: Severity
    description: str
    source_ip: str
    count: int = Field(..., ge=1)
    evidence: list[str] = Field(default_factory=list)
    geo: GeoLocation | None = None


class RiskAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    risk_score: int = Field(..., ge=0, le=100)
    risk_level: CanonicalRiskLevel


class AIAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    explanation: str
    risk_level: RiskLevel
    risk_score: int = Field(..., ge=0, le=100)
    recommended_action: str
    next_steps: list[str] = Field(default_factory=list)
    source: Literal["ollama", "fallback"]
    warning: str | None = None


class CampaignEventSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: str = Field(..., description="ISO-8601 timestamp string for a campaign evidence event.")
    title: str
    description: str
    endpoint: str
    status_code: int = Field(..., ge=100, le=599)
    detection_type: str


class CampaignPhase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase: str
    events: list[CampaignEventSummary] = Field(default_factory=list)


class TimelineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: str = Field(..., description="ISO-8601 timestamp string for the suspicious step.")
    title: str
    description: str
    severity: Severity
    type: str
    ip: str = Field(..., description="Source IP associated with the timeline step.")


class AttackCampaign(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attacker_ip: str = Field(..., description="Primary source IP associated with the campaign.")
    campaign_name: str
    phases: list[CampaignPhase] = Field(default_factory=list)
    severity: Severity
    risk_score: int = Field(..., ge=0, le=100)
    risk_level: CanonicalRiskLevel
    timeline: list[TimelineItem] = Field(default_factory=list)
    geo: GeoLocation | None = None


class CaseReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    created_at: str


class SessionReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    filename: str
    uploaded_at: str
    source_type: SessionSourceType = "upload"


class UploadResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[ParsedEvent]
    detections: list[Detection]
    ai_analysis: AIAnalysis
    timeline: list[TimelineItem] = Field(default_factory=list)
    risk_assessment: RiskAssessment
    attack_campaigns: list[AttackCampaign] = Field(default_factory=list)
    case: CaseReference | None = None
    session: SessionReference | None = None


class RiskTrendPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    filename: str
    uploaded_at: str
    risk_score: int = Field(..., ge=0, le=100)


class RepeatedAttacker(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ip: str
    appearances: int = Field(..., ge=1)
    latest_geo: GeoLocation | None = None


class UploadSessionDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    filename: str
    uploaded_at: str
    source_type: SessionSourceType = "upload"
    risk_score: int = Field(..., ge=0, le=100)
    snapshot: UploadResponse


class CaseSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    created_at: str
    session_count: int = Field(..., ge=0)
    latest_uploaded_at: str | None = None
    latest_risk_score: int = Field(..., ge=0, le=100)
    repeated_attacker_count: int = Field(..., ge=0)


class CaseDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    created_at: str
    sessions: list[UploadSessionDetail] = Field(default_factory=list)
    risk_trend: list[RiskTrendPoint] = Field(default_factory=list)
    repeated_attackers: list[RepeatedAttacker] = Field(default_factory=list)


class CreateCaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class RulesConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brute_force_threshold: int = Field(default=5, ge=1)
    brute_force_critical_threshold: int = Field(default=10, ge=1)
    scan_threshold: int = Field(default=10, ge=1)
    scan_high_threshold: int = Field(default=20, ge=1)
    probe_threshold: int = Field(default=8, ge=1)
    probe_high_threshold: int = Field(default=15, ge=1)
    time_window_seconds: int = Field(default=60, ge=1)
    campaign_gap_minutes: int = Field(default=30, ge=1)
    compromise_failure_threshold: int = Field(default=5, ge=1)
    compromise_success_window_seconds: int = Field(default=300, ge=1)
    compromise_success_status_codes: list[int] = Field(default_factory=lambda: [200])
    auth_endpoint_prefixes: list[str] = Field(default_factory=lambda: ["/login", "/signin", "/auth", "/wp-login.php"])
    path_traversal_threshold: int = Field(default=1, ge=1)
    path_traversal_critical_threshold: int = Field(default=3, ge=1)
    path_traversal_patterns: list[str] = Field(
        default_factory=lambda: ["../", "..\\", "%2e%2e/", "%2e%2e\\", "..%2f", "..%5c"]
    )
    path_traversal_sensitive_targets: list[str] = Field(
        default_factory=lambda: ["/etc/passwd", "/windows/system32", "/winnt/system32", "/proc/self/environ", "/boot.ini"]
    )
    sql_injection_threshold: int = Field(default=1, ge=1)
    sql_injection_critical_threshold: int = Field(default=3, ge=1)
    sql_injection_patterns: list[str] = Field(
        default_factory=lambda: ["' or '1'='1", '" or "1"="1', "union select", "--", ";--", "information_schema", "sleep("]
    )
    command_injection_threshold: int = Field(default=1, ge=1)
    command_injection_critical_threshold: int = Field(default=3, ge=1)
    command_injection_patterns: list[str] = Field(
        default_factory=lambda: ["; whoami", "; id", "; uname", "; curl", "; wget", "&&", "||", "`", "$("]
    )
    suspicious_user_agent_threshold: int = Field(default=2, ge=1)
    suspicious_user_agent_critical_threshold: int = Field(default=5, ge=1)
    suspicious_user_agent_signatures: list[str] = Field(
        default_factory=lambda: ["sqlmap", "nikto", "nmap", "curl", "python-requests"]
    )
    suspicious_user_agent_immediate_signatures: list[str] = Field(
        default_factory=lambda: ["sqlmap", "nikto", "nmap"]
    )

    @field_validator(
        "auth_endpoint_prefixes",
        "path_traversal_patterns",
        "path_traversal_sensitive_targets",
        "sql_injection_patterns",
        "command_injection_patterns",
        "suspicious_user_agent_signatures",
        "suspicious_user_agent_immediate_signatures",
    )
    @classmethod
    def ensure_non_empty_string_lists(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        if not cleaned:
            raise ValueError("At least one configured value is required.")
        return cleaned

    @field_validator("compromise_success_status_codes")
    @classmethod
    def ensure_status_codes(cls, value: list[int]) -> list[int]:
        cleaned = sorted({int(item) for item in value if 100 <= int(item) <= 599})
        if not cleaned:
            raise ValueError("At least one success status code is required.")
        return cleaned

    @model_validator(mode="after")
    def validate_threshold_pairs(self) -> "RulesConfig":
        threshold_pairs = (
            ("brute_force_threshold", "brute_force_critical_threshold"),
            ("scan_threshold", "scan_high_threshold"),
            ("probe_threshold", "probe_high_threshold"),
            ("path_traversal_threshold", "path_traversal_critical_threshold"),
            ("sql_injection_threshold", "sql_injection_critical_threshold"),
            ("command_injection_threshold", "command_injection_critical_threshold"),
            ("suspicious_user_agent_threshold", "suspicious_user_agent_critical_threshold"),
        )
        for low_key, high_key in threshold_pairs:
            if getattr(self, high_key) < getattr(self, low_key):
                raise ValueError(f"{high_key} must be greater than or equal to {low_key}.")
        return self


class UserSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    email: str
    created_at: str


class AuthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user: UserSummary


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not cleaned or "@" not in cleaned or "." not in cleaned.split("@")[-1]:
            raise ValueError("A valid email address is required.")
        return cleaned

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return cleaned


class LoginRequest(RegisterRequest):
    pass


class APIKeySummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    scope: APIKeyScope
    created_at: str
    revoked_at: str | None = None


class APIKeyCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    scope: APIKeyScope

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("API key name is required.")
        return cleaned


class APIKeyCreateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_key: str
    key: APIKeySummary


class SearchSessionMatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session: SessionReference
    matched_event_count: int = Field(default=0, ge=0)
    matched_detection_count: int = Field(default=0, ge=0)


class SearchEventMatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session: SessionReference
    event: ParsedEvent


class SearchDetectionMatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session: SessionReference
    detection: Detection


class SearchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str
    case: CaseReference
    sessions: list[SearchSessionMatch] = Field(default_factory=list)
    events: list[SearchEventMatch] = Field(default_factory=list)
    detections: list[SearchDetectionMatch] = Field(default_factory=list)


class ShareCaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expires_in_hours: int | None = Field(default=None, ge=1, le=24 * 30)


class ShareCaseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str
    expires_at: str


class SharedCaseView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case: CaseDetail
    expires_at: str


class ExecutiveCountryStat(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country: str
    count: int = Field(..., ge=0)


class ExecutiveRiskTrendPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day: str
    average_risk_score: float = Field(..., ge=0, le=100)
    session_count: int = Field(..., ge=0)


class ExecutiveSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_incidents: int = Field(..., ge=0)
    total_sessions: int = Field(..., ge=0)
    average_risk_score: float = Field(..., ge=0, le=100)
    top_attacker_countries: list[ExecutiveCountryStat] = Field(default_factory=list)
    risk_trend: list[ExecutiveRiskTrendPoint] = Field(default_factory=list)


class LiveStreamStartMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["start"]
    case_id: str | None = None
    filename: str | None = None


class LiveStreamLineMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["line"]
    line: str


class LiveStreamBatchMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["batch"]
    lines: list[str] = Field(default_factory=list)


class LiveStreamEndMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["end"]


class LiveStreamUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[ParsedEvent] = Field(default_factory=list)
    detections: list[Detection] = Field(default_factory=list)
    ai_analysis: AIAnalysis
    timeline: list[TimelineItem] = Field(default_factory=list)
    risk_assessment: RiskAssessment
    attack_campaigns: list[AttackCampaign] = Field(default_factory=list)
    case: CaseReference | None = None
    session: SessionReference | None = None
    skipped_lines: int = Field(default=0, ge=0)
    total_lines: int = Field(default=0, ge=0)


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok", "degraded"]
    ollama_available: bool
    ollama_model: str
    model_present: bool
    warning: str | None = None
