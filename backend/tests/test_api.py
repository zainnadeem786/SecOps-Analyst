import json
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.services.ai_explainer import OllamaExplainer, get_ai_explainer


class SuccessfulExplainer(OllamaExplainer):
    last_prompt: str | None = None

    async def _request_completion(self, prompt: str, detection_count: int) -> str:
        SuccessfulExplainer.last_prompt = prompt
        return json.dumps(
            {
                "explanation": "The upload contains a mix of reconnaissance and authentication abuse indicators.",
                "risk_level": "High",
                "recommended_action": "Investigate the flagged IPs and harden exposed login surfaces.",
            }
        )

    async def _fetch_tags(self) -> dict:
        return {"models": [{"name": "mistral:latest"}]}


class TimeoutExplainer(OllamaExplainer):
    async def _request_completion(self, prompt: str, detection_count: int) -> str:
        raise httpx.TimeoutException("timed out")

    async def _fetch_tags(self) -> dict:
        return {"models": [{"name": "mistral:latest"}]}


class InvalidJsonExplainer(OllamaExplainer):
    async def _request_completion(self, prompt: str, detection_count: int) -> str:
        return "not-json"

    async def _fetch_tags(self) -> dict:
        return {"models": [{"name": "mistral:latest"}]}


class MissingResponseExplainer(OllamaExplainer):
    async def _request_completion(self, prompt: str, detection_count: int) -> str:
        raise ValueError("Ollama response did not contain a 'response' field.")

    async def _fetch_tags(self) -> dict:
        return {"models": [{"name": "mistral:latest"}]}


class InvalidRiskExplainer(OllamaExplainer):
    async def _request_completion(self, prompt: str, detection_count: int) -> str:
        return json.dumps(
            {
                "explanation": "Reconnaissance is underway.",
                "risk_level": "Severe",
                "recommended_action": "Investigate immediately.",
            }
        )

    async def _fetch_tags(self) -> dict:
        return {"models": [{"name": "mistral:latest"}]}


class MissingModelExplainer(OllamaExplainer):
    async def _request_completion(self, prompt: str, detection_count: int) -> str:
        return json.dumps(
            {
                "explanation": "Unused in health checks.",
                "risk_level": "Low",
                "recommended_action": "No action.",
            }
        )

    async def _fetch_tags(self) -> dict:
        return {"models": [{"name": "llama3:latest"}]}


def _sample_log_bytes() -> bytes:
    fixture_path = Path(__file__).parent / "fixtures" / "sample_access.log"
    return fixture_path.read_bytes()


def test_upload_log_returns_events_and_detections() -> None:
    SuccessfulExplainer.last_prompt = None
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
        )

    app.dependency_overrides.clear()
    payload = response.json()

    assert response.status_code == 200
    assert len(payload["events"]) >= 20
    assert len(payload["detections"]) >= 3
    assert payload["ai_analysis"]["source"] == "ollama"
    assert SuccessfulExplainer.last_prompt is not None
    assert "Detected " in SuccessfulExplainer.last_prompt
    assert "total_events" not in SuccessfulExplainer.last_prompt
    assert '"status_code"' not in SuccessfulExplainer.last_prompt


def test_upload_log_falls_back_when_ollama_times_out() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: TimeoutExplainer(get_settings())

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
        )

    app.dependency_overrides.clear()
    payload = response.json()

    assert response.status_code == 200
    assert payload["ai_analysis"]["source"] == "fallback"
    assert "warning" in payload["ai_analysis"]


def test_upload_log_falls_back_on_invalid_json() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: InvalidJsonExplainer(get_settings())

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["ai_analysis"]["source"] == "fallback"


def test_upload_log_falls_back_when_ollama_response_is_missing_fields() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: MissingResponseExplainer(get_settings())

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["ai_analysis"]["source"] == "fallback"


def test_upload_log_falls_back_on_invalid_risk_level() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: InvalidRiskExplainer(get_settings())

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["ai_analysis"]["source"] == "fallback"


def test_health_reports_readiness() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())

    with TestClient(app) as client:
        response = client.get("/health")

    app.dependency_overrides.clear()
    payload = response.json()

    assert response.status_code == 200
    assert payload == {
        "status": "ok",
        "ollama_available": True,
        "ollama_model": "mistral",
        "model_present": True,
        "warning": None,
    }


def test_health_reports_missing_model_as_degraded() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: MissingModelExplainer(get_settings())

    with TestClient(app) as client:
        response = client.get("/health")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "status": "degraded",
        "ollama_available": True,
        "ollama_model": "mistral",
        "model_present": False,
        "warning": "Ollama is reachable, but the configured model is not installed.",
    }


def test_upload_log_rejects_unsupported_extensions() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample.csv", b"header,value", "text/csv")},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "Only .log and .txt files are supported."}


def test_upload_log_rejects_empty_files() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("empty.log", b"", "text/plain")},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "Uploaded file is empty."}


def test_upload_log_rejects_files_over_the_size_limit() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())
    oversized_payload = b"x" * ((10 * 1024 * 1024) + 1)

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("oversized.log", oversized_payload, "text/plain")},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 413
    assert response.json() == {"detail": "Uploaded file exceeds the 10 MB limit."}


def test_upload_log_rejects_fully_unparsable_content() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("invalid.log", b"this is not an access log", "text/plain")},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "No supported access log entries were found in the uploaded file."}
