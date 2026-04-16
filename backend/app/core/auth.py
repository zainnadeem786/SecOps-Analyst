from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, HTTPException, Request, WebSocket, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import Settings, get_settings
from app.core.security import AuthContext, decode_access_token, hash_api_key, normalize_guest_id, resolve_request_auth_context
from app.db.deps import get_db_session
from app.db.models import UserRecord
from app.db.repositories import get_api_key_by_hash, get_guest_usage, get_user_by_id
from app.models.log_model import APIKeyScope


@dataclass(slots=True)
class ResolvedAuthContext:
    user: UserRecord | None = None
    guest_id: str | None = None
    auth_source: Literal["cookie", "api_key", "guest", "anonymous", "invalid_api_key"] = "anonymous"
    api_key_scope: APIKeyScope | None = None
    api_key_id: str | None = None

    @property
    def user_id(self) -> str | None:
        return self.user.id if self.user else None

    @property
    def is_authenticated(self) -> bool:
        return self.user is not None

    @property
    def is_guest(self) -> bool:
        return self.user is None and self.guest_id is not None

    @property
    def is_api_key(self) -> bool:
        return self.auth_source == "api_key"


class IdentityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings: Settings) -> None:
        super().__init__(app)
        self.settings = settings

    async def dispatch(self, request: Request, call_next):
        request.state.auth_context = resolve_request_auth_context(request, self.settings)
        return await call_next(request)


def get_request_auth_context(request: Request) -> AuthContext:
    context = getattr(request.state, "auth_context", None)
    if isinstance(context, AuthContext):
        return context
    return AuthContext()


async def get_resolved_auth_context(
    request: Request,
    db_session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> ResolvedAuthContext:
    raw_context = getattr(request.state, "auth_context", None)
    if not isinstance(raw_context, AuthContext):
        raw_context = resolve_request_auth_context(request, settings)
    if raw_context.bearer_token:
        api_key = await get_api_key_by_hash(db_session, hash_api_key(raw_context.bearer_token))
        if api_key is not None and api_key.revoked_at is None:
            user = await get_user_by_id(db_session, api_key.user_id)
            if user is not None:
                return ResolvedAuthContext(
                    user=user,
                    auth_source="api_key",
                    api_key_scope=api_key.scope,
                    api_key_id=api_key.id,
                )
        return ResolvedAuthContext(auth_source="invalid_api_key")
    if raw_context.user_id:
        user = await get_user_by_id(db_session, raw_context.user_id)
        if user is not None:
            return ResolvedAuthContext(user=user, auth_source="cookie")
    if raw_context.guest_id:
        return ResolvedAuthContext(guest_id=raw_context.guest_id, auth_source="guest")
    return ResolvedAuthContext(auth_source=raw_context.auth_source)


async def require_user(
    context: ResolvedAuthContext = Depends(get_resolved_auth_context),
) -> ResolvedAuthContext:
    if not context.user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    return context


async def require_cookie_user(
    context: ResolvedAuthContext = Depends(get_resolved_auth_context),
) -> ResolvedAuthContext:
    if not context.user or context.auth_source != "cookie":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cookie-based authentication required.")
    return context


def require_api_scope(required_scope: APIKeyScope):
    async def dependency(context: ResolvedAuthContext = Depends(get_resolved_auth_context)) -> ResolvedAuthContext:
        if context.user and context.auth_source == "cookie":
            return context
        if context.user and context.auth_source == "api_key" and context.api_key_scope == required_scope:
            return context
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    return dependency


async def ensure_ingest_authorized(context: ResolvedAuthContext) -> None:
    if context.auth_source == "invalid_api_key":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key.")
    if context.auth_source == "api_key" and context.api_key_scope != "ingest":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API key does not have ingest scope.")


async def ensure_guest_limit_not_reached(
    context: ResolvedAuthContext,
    db_session: AsyncSession,
    settings: Settings,
) -> None:
    if not context.is_guest or not context.guest_id:
        return
    usage = await get_guest_usage(db_session, context.guest_id)
    if usage and usage.usage_count >= settings.guest_analysis_limit:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "AUTH_REQUIRED",
                "message": "Please login to continue using the platform",
            },
        )


def resolve_websocket_auth_context(websocket: WebSocket, settings: Settings) -> AuthContext:
    authorization = websocket.headers.get("Authorization", "")
    if authorization.lower().startswith("bearer "):
        bearer_token = authorization.split(" ", maxsplit=1)[1].strip()
        if bearer_token:
            return AuthContext(bearer_token=bearer_token, auth_source="api_key")

    api_key = normalize_guest_id(websocket.query_params.get("api_key"))
    if api_key:
        return AuthContext(bearer_token=api_key, auth_source="api_key")

    token = websocket.cookies.get(settings.auth_cookie_name)
    if token:
        payload = decode_access_token(token, settings)
        if payload:
            return AuthContext(user_id=payload["user_id"], auth_source="cookie")
    guest_id = normalize_guest_id(websocket.query_params.get("guest_id"))
    if guest_id is None and websocket.client and websocket.client.host:
        guest_id = f"ip:{websocket.client.host}"
    if guest_id:
        return AuthContext(guest_id=guest_id, auth_source="guest")
    return AuthContext(auth_source="anonymous")


async def resolve_websocket_context(
    websocket: WebSocket,
    db_session: AsyncSession,
    settings: Settings,
) -> ResolvedAuthContext:
    raw_context = resolve_websocket_auth_context(websocket, settings)
    if raw_context.bearer_token:
        api_key = await get_api_key_by_hash(db_session, hash_api_key(raw_context.bearer_token))
        if api_key is not None and api_key.revoked_at is None:
            user = await get_user_by_id(db_session, api_key.user_id)
            if user is not None:
                return ResolvedAuthContext(
                    user=user,
                    auth_source="api_key",
                    api_key_scope=api_key.scope,
                    api_key_id=api_key.id,
                )
        return ResolvedAuthContext(auth_source="invalid_api_key")
    if raw_context.user_id:
        user = await get_user_by_id(db_session, raw_context.user_id)
        if user is not None:
            return ResolvedAuthContext(user=user, auth_source="cookie")
    if raw_context.guest_id:
        return ResolvedAuthContext(guest_id=raw_context.guest_id, auth_source="guest")
    return ResolvedAuthContext(auth_source="anonymous")
