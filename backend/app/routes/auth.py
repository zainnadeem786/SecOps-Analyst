from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_cookie_user, require_user
from app.core.config import Settings, get_settings
from app.core.security import (
    clear_auth_cookie,
    create_access_token,
    generate_api_key,
    hash_api_key,
    hash_password,
    normalize_guest_id,
    set_auth_cookie,
    verify_password,
)
from app.db.deps import get_db_session
from app.db.repositories import (
    build_api_key_summary,
    build_auth_response,
    claim_guest_assets,
    create_api_key,
    create_user,
    get_user_by_email,
    list_api_keys,
    revoke_api_key,
)
from app.models.log_model import APIKeyCreateRequest, APIKeyCreateResponse, APIKeySummary, AuthResponse, LoginRequest, RegisterRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, summary="Register a new user account")
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db_session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AuthResponse:
    existing = await get_user_by_email(db_session, payload.email)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.")

    user = await create_user(db_session, email=payload.email, password_hash=hash_password(payload.password))
    guest_id = normalize_guest_id(request.headers.get("X-Guest-ID"))
    if guest_id:
        await claim_guest_assets(db_session, user=user, guest_id=guest_id)
    await db_session.commit()

    set_auth_cookie(
        response,
        create_access_token(user_id=user.id, email=user.email, settings=settings),
        settings,
    )
    return build_auth_response(user)


@router.post("/login", response_model=AuthResponse, summary="Login with email and password")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db_session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AuthResponse:
    user = await get_user_by_email(db_session, payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    guest_id = normalize_guest_id(request.headers.get("X-Guest-ID"))
    if guest_id:
        await claim_guest_assets(db_session, user=user, guest_id=guest_id)
    await db_session.commit()

    set_auth_cookie(
        response,
        create_access_token(user_id=user.id, email=user.email, settings=settings),
        settings,
    )
    return build_auth_response(user)


@router.post("/logout", summary="Clear the authenticated session cookie")
async def logout(
    response: Response,
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    clear_auth_cookie(response, settings)
    return {"detail": "Logged out."}


@router.get("/me", response_model=AuthResponse, summary="Get the current authenticated user")
async def me(
    context=Depends(require_user),
) -> AuthResponse:
    return build_auth_response(context.user)


@router.post("/api-keys", response_model=APIKeyCreateResponse, summary="Create a scoped API key")
async def create_api_key_endpoint(
    payload: APIKeyCreateRequest,
    context=Depends(require_cookie_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> APIKeyCreateResponse:
    plaintext_key = generate_api_key(scope=payload.scope)
    record = await create_api_key(
        db_session,
        user=context.user,
        hashed_key=hash_api_key(plaintext_key),
        name=payload.name,
        scope=payload.scope,
    )
    await db_session.commit()
    return APIKeyCreateResponse(api_key=plaintext_key, key=build_api_key_summary(record))


@router.get("/api-keys", response_model=list[APIKeySummary], summary="List scoped API keys")
async def list_api_keys_endpoint(
    context=Depends(require_cookie_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> list[APIKeySummary]:
    records = await list_api_keys(db_session, user_id=context.user_id)
    return [build_api_key_summary(record) for record in records]


@router.delete("/api-keys/{key_id}", response_model=APIKeySummary, summary="Revoke an API key")
async def revoke_api_key_endpoint(
    key_id: str,
    context=Depends(require_cookie_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> APIKeySummary:
    record = await revoke_api_key(db_session, key_id=key_id, user_id=context.user_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found.")
    await db_session.commit()
    return build_api_key_summary(record)
