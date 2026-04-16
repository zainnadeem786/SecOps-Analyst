from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt
from fastapi import HTTPException, Request, Response, status
from jwt import InvalidTokenError

from app.core.config import Settings
from app.models.log_model import APIKeyScope

JWT_ALGORITHM = "HS256"
AUTH_REQUIRED_DETAIL = {
    "error": "AUTH_REQUIRED",
    "message": "Please login to continue using the platform",
}


@dataclass(slots=True)
class AuthContext:
    user_id: str | None = None
    guest_id: str | None = None
    auth_source: Literal["cookie", "api_key", "guest", "anonymous", "invalid_api_key"] = "anonymous"
    api_key_scope: APIKeyScope | None = None
    bearer_token: str | None = None
    api_key_id: str | None = None

    @property
    def is_authenticated(self) -> bool:
        return self.user_id is not None

    @property
    def is_guest(self) -> bool:
        return self.user_id is None and self.guest_id is not None


def normalize_guest_id(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(*, user_id: str, email: str, settings: Settings) -> str:
    expires_at = datetime.now(UTC) + timedelta(hours=settings.auth_token_ttl_hours)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=JWT_ALGORITHM)


def generate_api_key(*, scope: APIKeyScope) -> str:
    return f"soa_{scope}_{secrets.token_urlsafe(24)}"


def hash_api_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def decode_access_token(token: str, settings: Settings) -> dict[str, str] | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[JWT_ALGORITHM])
    except InvalidTokenError:
        return None
    if not isinstance(payload, dict):
        return None
    user_id = str(payload.get("sub", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    if not user_id or not email:
        return None
    return {"user_id": user_id, "email": email}


def set_auth_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        max_age=settings.auth_token_ttl_hours * 60 * 60,
        path="/",
    )


def clear_auth_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.auth_cookie_name,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def resolve_request_auth_context(request: Request, settings: Settings) -> AuthContext:
    authorization = request.headers.get("Authorization", "")
    if authorization.lower().startswith("bearer "):
        bearer_token = authorization.split(" ", maxsplit=1)[1].strip()
        if bearer_token:
            return AuthContext(bearer_token=bearer_token, auth_source="api_key")

    token = request.cookies.get(settings.auth_cookie_name)
    if token:
        payload = decode_access_token(token, settings)
        if payload:
            return AuthContext(user_id=payload["user_id"], auth_source="cookie")

    guest_id = normalize_guest_id(request.headers.get("X-Guest-ID"))
    if guest_id is None and request.client and request.client.host:
        guest_id = f"ip:{request.client.host}"
    if guest_id:
        return AuthContext(guest_id=guest_id, auth_source="guest")
    return AuthContext(auth_source="anonymous")


def hash_share_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_share_token() -> str:
    return secrets.token_urlsafe(24)


def raise_auth_required() -> None:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=AUTH_REQUIRED_DETAIL)
