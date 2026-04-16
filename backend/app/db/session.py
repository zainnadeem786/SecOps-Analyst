from __future__ import annotations

import logging
from functools import lru_cache

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_engine() -> AsyncEngine:
    settings = get_settings()
    return create_async_engine(
        settings.database_url,
        future=True,
        pool_pre_ping=True,
    )


@lru_cache(maxsize=1)
def get_session_maker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def ping_database(settings: Settings | None = None) -> None:
    """Log database reachability without crashing the app startup."""

    _ = settings or get_settings()
    try:
        async with get_engine().connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - startup visibility only
        logger.warning("Database connection check failed: %s", exc)
