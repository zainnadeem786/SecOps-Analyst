"""Compatibility shim for older imports.

The canonical model module is ``app.models.log_model``.
"""

from app.models.log_model import AIAnalysis, Detection, HealthResponse, ParsedEvent, RiskLevel, Severity, UploadResponse

__all__ = [
    "AIAnalysis",
    "Detection",
    "HealthResponse",
    "ParsedEvent",
    "RiskLevel",
    "Severity",
    "UploadResponse",
]