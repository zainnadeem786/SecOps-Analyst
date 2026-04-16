import json
from pathlib import Path
from uuid import uuid4

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
                "next_steps": [
                    "Block suspicious IPs at the edge.",
                    "Review successful authentication events.",
                    "Harden exposed login endpoints.",
                ],
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
                "next_steps": [
                    "Review the affected attack campaign.",
                    "Block the suspicious source if activity persists.",
                    "Preserve evidence for the investigation timeline.",
                ],
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


def _guest_headers() -> dict[str, str]:
    return {"X-Guest-ID": f"guest-{uuid4().hex}"}


def test_upload_log_returns_events_and_detections() -> None:
    SuccessfulExplainer.last_prompt = None
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())
    guest_headers = _guest_headers()

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
            headers=guest_headers,
        )

    app.dependency_overrides.clear()
    payload = response.json()

    assert response.status_code == 200
    assert len(payload["events"]) >= 20
    assert len(payload["detections"]) == 3
    assert len(payload["timeline"]) == len(payload["detections"])
    assert payload["risk_assessment"] == {
        "risk_score": 100,
        "risk_level": "High",
    }
    assert len(payload["attack_campaigns"]) == 3
    assert {campaign["attacker_ip"] for campaign in payload["attack_campaigns"]} == {
        "203.0.113.10",
        "198.51.100.24",
        "192.0.2.77",
    }
    assert [item["timestamp"] for item in payload["timeline"]] == sorted(item["timestamp"] for item in payload["timeline"])
    assert payload["timeline"][0] == {
        "timestamp": "2026-04-09T09:00:01+00:00",
        "title": "Multiple failed login attempts",
        "description": "5 failed login attempts detected from IP 203.0.113.10. Targeted endpoint: /login.",
        "severity": "High",
        "type": "brute_force",
        "ip": "203.0.113.10",
    }
    assert {item["title"] for item in payload["timeline"]} == {
        "Multiple failed login attempts",
        "Endpoint scanning activity detected",
        "Suspicious multi-endpoint probing",
    }
    assert {
        (item["type"], item["ip"])
        for item in payload["timeline"]
    } == {
        ("brute_force", "203.0.113.10"),
        ("scanning_fuzzing", "198.51.100.24"),
        ("multi_endpoint_probe", "192.0.2.77"),
    }
    assert payload["ai_analysis"]["source"] == "ollama"
    assert payload["ai_analysis"]["risk_score"] == payload["risk_assessment"]["risk_score"]
    assert payload["ai_analysis"]["risk_level"] == payload["risk_assessment"]["risk_level"]
    assert payload["session"]["source_type"] == "upload"
    assert payload["ai_analysis"]["next_steps"] == [
        "Block suspicious IPs at the edge.",
        "Review successful authentication events.",
        "Harden exposed login endpoints.",
    ]
    assert SuccessfulExplainer.last_prompt is not None
    assert "Detected " in SuccessfulExplainer.last_prompt
    assert "Risk Assessment:" in SuccessfulExplainer.last_prompt
    assert "Attack Campaigns:" in SuccessfulExplainer.last_prompt
    assert "total_events" not in SuccessfulExplainer.last_prompt
    assert '"status_code"' not in SuccessfulExplainer.last_prompt


def test_upload_log_returns_empty_timeline_when_no_detections_match() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())
    guest_headers = _guest_headers()
    benign_log = "\n".join(
        [
            '203.0.113.10 - - [09/Apr/2026:11:00:00 +0000] "GET / HTTP/1.1" 200 421 "-" "Mozilla/5.0"',
            '203.0.113.10 - - [09/Apr/2026:11:00:01 +0000] "GET /health HTTP/1.1" 200 120 "-" "curl/8.0"',
        ]
    ).encode()

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("benign.log", benign_log, "text/plain")},
            headers=guest_headers,
        )

    app.dependency_overrides.clear()
    payload = response.json()

    assert response.status_code == 200
    assert len(payload["events"]) == 2
    assert payload["detections"] == []
    assert payload["timeline"] == []
    assert payload["risk_assessment"] == {
        "risk_score": 0,
        "risk_level": "Low",
    }
    assert payload["attack_campaigns"] == []
    assert payload["ai_analysis"] == {
        "explanation": "No suspicious activity matched the configured detection rules for this upload.",
        "risk_level": "Low",
        "risk_score": 0,
        "recommended_action": (
            "Retain the log for audit purposes, continue normal monitoring, and extend "
            "the rule set if you need broader threat coverage."
        ),
        "next_steps": [
            "Retain this upload for audit and baseline comparison.",
            "Continue monitoring for new suspicious activity.",
            "Refine detection rules if broader coverage is required.",
        ],
        "source": "fallback",
        "warning": None,
    }


def test_upload_log_falls_back_when_ollama_times_out() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: TimeoutExplainer(get_settings())
    guest_headers = _guest_headers()

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
            headers=guest_headers,
        )

    app.dependency_overrides.clear()
    payload = response.json()

    assert response.status_code == 200
    assert payload["ai_analysis"]["source"] == "fallback"
    assert "warning" in payload["ai_analysis"]


def test_upload_log_falls_back_on_invalid_json() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: InvalidJsonExplainer(get_settings())
    guest_headers = _guest_headers()

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
            headers=guest_headers,
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["ai_analysis"]["source"] == "fallback"


def test_upload_log_falls_back_when_ollama_response_is_missing_fields() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: MissingResponseExplainer(get_settings())
    guest_headers = _guest_headers()

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
            headers=guest_headers,
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["ai_analysis"]["source"] == "fallback"


def test_upload_log_keeps_live_ai_when_ollama_returns_an_unknown_risk_level() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: InvalidRiskExplainer(get_settings())
    guest_headers = _guest_headers()

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
            headers=guest_headers,
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["ai_analysis"]["source"] == "ollama"
    assert payload["ai_analysis"]["risk_level"] == payload["risk_assessment"]["risk_level"]
    assert payload["ai_analysis"]["risk_score"] == payload["risk_assessment"]["risk_score"]


def test_export_report_returns_pdf_bytes_for_analyzed_snapshot() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())
    guest_headers = _guest_headers()

    with TestClient(app) as client:
        upload_response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
            headers=guest_headers,
        )
        export_response = client.post("/export-report", json=upload_response.json())

    app.dependency_overrides.clear()

    assert upload_response.status_code == 200
    assert export_response.status_code == 200
    assert export_response.headers["content-type"].startswith("application/pdf")
    assert len(export_response.content) > 100


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
    guest_headers = _guest_headers()

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("sample.csv", b"header,value", "text/csv")},
            headers=guest_headers,
        )

    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "Only .log and .txt files are supported."}


def test_upload_log_rejects_empty_files() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())
    guest_headers = _guest_headers()

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("empty.log", b"", "text/plain")},
            headers=guest_headers,
        )

    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "Uploaded file is empty."}


def test_upload_log_rejects_files_over_the_size_limit() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())
    oversized_payload = b"x" * ((10 * 1024 * 1024) + 1)
    guest_headers = _guest_headers()

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("oversized.log", oversized_payload, "text/plain")},
            headers=guest_headers,
        )

    app.dependency_overrides.clear()

    assert response.status_code == 413
    assert response.json() == {"detail": "Uploaded file exceeds the 10 MB limit."}


def test_upload_log_rejects_fully_unparsable_content() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: SuccessfulExplainer(get_settings())
    guest_headers = _guest_headers()

    with TestClient(app) as client:
        response = client.post(
            "/upload-log",
            files={"file": ("invalid.log", b"this is not an access log", "text/plain")},
            headers=guest_headers,
        )

    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "No supported access log entries were found in the uploaded file."}
