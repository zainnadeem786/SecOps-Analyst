from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.services.ai_explainer import OllamaExplainer, get_ai_explainer


class DeterministicExplainer(OllamaExplainer):
    async def _request_completion(self, prompt: str, detection_count: int) -> str:
        return json.dumps(
            {
                "explanation": "The upload contains correlated suspicious activity.",
                "risk_level": "High",
                "recommended_action": "Investigate the attacker infrastructure and exposed authentication paths.",
                "next_steps": [
                    "Block the suspicious IPs.",
                    "Review successful logins around the detections.",
                    "Preserve the case evidence for response work.",
                ],
            }
        )

    async def _fetch_tags(self) -> dict:
        return {"models": [{"name": "mistral:latest"}]}


def _sample_log_bytes() -> bytes:
    fixture_path = Path(__file__).parent / "fixtures" / "sample_access.log"
    return fixture_path.read_bytes()


def _unique_email() -> str:
    return f"analyst-{uuid4().hex[:10]}@example.com"


def _unique_guest_id() -> str:
    return f"guest-{uuid4().hex}"


def _register_user(client: TestClient, *, guest_id: str | None = None) -> dict:
    headers = {"X-Guest-ID": guest_id} if guest_id else None
    response = client.post(
        "/auth/register",
        json={"email": _unique_email(), "password": "Password123!"},
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()


def test_auth_register_me_logout_and_duplicate_email() -> None:
    email = _unique_email()

    with TestClient(app) as client:
        register_response = client.post(
            "/auth/register",
            json={"email": email, "password": "Password123!"},
        )
        duplicate_response = client.post(
            "/auth/register",
            json={"email": email, "password": "Password123!"},
        )
        me_response = client.get("/auth/me")
        logout_response = client.post("/auth/logout")
        after_logout_response = client.get("/auth/me")

    assert register_response.status_code == 200
    assert register_response.json()["user"]["email"] == email
    assert duplicate_response.status_code == 409
    assert me_response.status_code == 200
    assert logout_response.status_code == 200
    assert after_logout_response.status_code == 401


def test_guest_limit_blocks_fourth_analysis() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: DeterministicExplainer(get_settings())
    guest_id = _unique_guest_id()

    with TestClient(app) as client:
        responses = [
            client.post(
                "/upload-log",
                files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
                headers={"X-Guest-ID": guest_id},
            )
            for _ in range(3)
        ]
        blocked_response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
            headers={"X-Guest-ID": guest_id},
        )

    app.dependency_overrides.clear()

    assert all(response.status_code == 200 for response in responses)
    assert blocked_response.status_code == 401
    assert blocked_response.json() == {
        "error": "AUTH_REQUIRED",
        "message": "Please login to continue using the platform",
    }


def test_register_claims_guest_case_assets() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: DeterministicExplainer(get_settings())
    guest_id = _unique_guest_id()

    with TestClient(app) as client:
        upload_response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
            headers={"X-Guest-ID": guest_id},
        )
        case_id = upload_response.json()["case"]["id"]
        register_response = _register_user(client, guest_id=guest_id)
        cases_response = client.get("/cases")
        case_detail_response = client.get(f"/cases/{case_id}")

    app.dependency_overrides.clear()

    assert upload_response.status_code == 200
    assert register_response["user"]["id"]
    assert cases_response.status_code == 200
    assert any(item["id"] == case_id for item in cases_response.json())
    assert case_detail_response.status_code == 200
    assert case_detail_response.json()["id"] == case_id


def test_search_filters_authorized_case_snapshot() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: DeterministicExplainer(get_settings())

    with TestClient(app) as client:
        _register_user(client)
        upload_response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
        )
        payload = upload_response.json()
        search_response = client.get(
            "/search",
            params={
                "q": "ip:203.0.113.10 status:401 endpoint:/login",
                "case_id": payload["case"]["id"],
                "session_id": payload["session"]["id"],
            },
        )

    app.dependency_overrides.clear()

    assert upload_response.status_code == 200
    assert search_response.status_code == 200
    search_payload = search_response.json()
    assert len(search_payload["sessions"]) == 1
    assert search_payload["sessions"][0]["session"]["id"] == payload["session"]["id"]
    assert all(item["event"]["ip"] == "203.0.113.10" for item in search_payload["events"])
    assert all(item["event"]["status_code"] == 401 for item in search_payload["events"])
    assert {item["detection"]["type"] for item in search_payload["detections"]} == {"brute_force"}


def test_share_case_and_executive_summary_are_user_scoped() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: DeterministicExplainer(get_settings())

    with TestClient(app) as owner_client:
        _register_user(owner_client)
        upload_response = owner_client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
        )
        case_id = upload_response.json()["case"]["id"]
        share_response = owner_client.post(f"/cases/{case_id}/share", json={})
        executive_response = owner_client.get("/executive/summary")

    with TestClient(app) as shared_client:
        shared_view_response = shared_client.get(f"/share/{share_response.json()['token']}")

    app.dependency_overrides.clear()

    assert upload_response.status_code == 200
    assert share_response.status_code == 200
    assert executive_response.status_code == 200
    executive_payload = executive_response.json()
    assert executive_payload["total_incidents"] >= 1
    assert executive_payload["total_sessions"] >= 1
    assert executive_payload["average_risk_score"] > 0

    assert shared_view_response.status_code == 200
    shared_payload = shared_view_response.json()
    assert shared_payload["case"]["id"] == case_id
    assert "user_id" not in json.dumps(shared_payload)


def test_api_key_lifecycle_and_scope_enforcement() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: DeterministicExplainer(get_settings())

    with TestClient(app) as client:
        _register_user(client)

        create_ingest = client.post(
            "/auth/api-keys",
            json={"name": "Pipeline ingest", "scope": "ingest"},
        )
        create_read = client.post(
            "/auth/api-keys",
            json={"name": "Readonly", "scope": "read"},
        )
        list_response = client.get("/auth/api-keys")

        ingest_key = create_ingest.json()["api_key"]
        read_key_id = create_read.json()["key"]["id"]

        upload_with_ingest = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
            headers={"Authorization": f"Bearer {ingest_key}"},
        )
        upload_with_read = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
            headers={"Authorization": f"Bearer {create_read.json()['api_key']}"},
        )
        revoke_response = client.delete(f"/auth/api-keys/{read_key_id}")

    app.dependency_overrides.clear()

    assert create_ingest.status_code == 200
    assert create_read.status_code == 200
    assert list_response.status_code == 200
    assert len(list_response.json()) >= 2
    assert upload_with_ingest.status_code == 200
    assert upload_with_ingest.json()["session"]["source_type"] == "upload"
    assert upload_with_read.status_code == 403
    assert revoke_response.status_code == 200
    assert revoke_response.json()["revoked_at"] is not None


def test_read_api_key_can_access_cases_and_ingest_api_key_can_stream() -> None:
    app.dependency_overrides[get_ai_explainer] = lambda: DeterministicExplainer(get_settings())

    with TestClient(app) as client:
        _register_user(client)
        upload_response = client.post(
            "/upload-log",
            files={"file": ("sample_access.log", _sample_log_bytes(), "text/plain")},
        )
        case_id = upload_response.json()["case"]["id"]

        read_key_response = client.post(
            "/auth/api-keys",
            json={"name": "Readonly", "scope": "read"},
        )
        ingest_key_response = client.post(
            "/auth/api-keys",
            json={"name": "Stream ingest", "scope": "ingest"},
        )

        read_key = read_key_response.json()["api_key"]
        cases_response = client.get(
            "/cases",
            headers={"Authorization": f"Bearer {read_key}"},
        )
        case_detail_response = client.get(
            f"/cases/{case_id}",
            headers={"Authorization": f"Bearer {read_key}"},
        )

        ingest_key = ingest_key_response.json()["api_key"]
        with client.websocket_connect(
            "/ws/log-stream",
            headers={"Authorization": f"Bearer {ingest_key}"},
        ) as websocket:
            websocket.send_json({"type": "start", "filename": "stream.log"})
            ready_message = websocket.receive_json()
            websocket.send_json(
                {
                    "type": "batch",
                    "lines": _sample_log_bytes().decode("utf-8").splitlines()[:6],
                }
            )
            websocket.send_json({"type": "end"})
            final_message = websocket.receive_json()

    app.dependency_overrides.clear()

    assert cases_response.status_code == 200
    assert case_detail_response.status_code == 200
    assert ready_message["type"] == "ready"
    assert final_message["session"]["source_type"] == "live_stream"
