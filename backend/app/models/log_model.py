from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Severity = Literal["Low", "Moderate", "Medium", "High", "Critical"]
RiskLevel = Literal["Low", "Medium", "High", "Critical"]


class ParsedEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ip: str = Field(..., description="Source IP address.")
    endpoint: str = Field(..., description="Normalized request path.")
    status_code: int = Field(..., ge=100, le=599)
    timestamp: str = Field(..., description="ISO-8601 timestamp string.")


class Detection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    severity: Severity
    description: str
    source_ip: str
    count: int = Field(..., ge=1)
    evidence: list[str] = Field(default_factory=list)


class AIAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    explanation: str
    risk_level: RiskLevel
    recommended_action: str
    source: Literal["ollama", "fallback"]
    warning: str | None = None


class UploadResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[ParsedEvent]
    detections: list[Detection]
    ai_analysis: AIAnalysis


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok", "degraded"]
    ollama_available: bool
    ollama_model: str
    model_present: bool
    warning: str | None = None