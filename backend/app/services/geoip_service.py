from __future__ import annotations

import logging
from functools import lru_cache

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.repositories import get_geo_cache, is_geo_cache_fresh, upsert_geo_cache
from app.models.log_model import GeoLocation

logger = logging.getLogger(__name__)


class GeoIPService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.timeout = httpx.Timeout(settings.geoip_timeout_seconds)

    async def resolve_many(self, session: AsyncSession, ips: set[str]) -> dict[str, GeoLocation]:
        if not self.settings.geoip_enabled or not ips:
            return {}

        resolved: dict[str, GeoLocation] = {}
        for ip in sorted(ips):
            geo = await self.resolve_ip(session, ip)
            if geo is not None:
                resolved[ip] = geo
        return resolved

    async def resolve_ip(self, session: AsyncSession, ip: str) -> GeoLocation | None:
        cached = await get_geo_cache(session, ip)
        if cached and is_geo_cache_fresh(cached, self.settings.geoip_cache_ttl_seconds):
            if cached.country and cached.lat is not None and cached.lon is not None:
                return GeoLocation(ip=ip, country=cached.country, lat=cached.lat, lon=cached.lon)
            return None

        geo = None
        status = "error"
        try:
            geo = await self._fetch_geo(ip)
            status = "ok" if geo else "empty"
        except Exception as exc:  # pragma: no cover - external service protection
            logger.warning("GeoIP lookup failed for %s: %s", ip, exc)
            status = "error"
        finally:
            await upsert_geo_cache(
                session,
                ip=ip,
                provider=self.settings.geoip_provider_url,
                status=status,
                geo=geo,
            )

        return geo

    async def _fetch_geo(self, ip: str) -> GeoLocation | None:
        url = f"{self.settings.geoip_provider_url.rstrip('/')}/{ip}"
        params = {"fields": "status,country,lat,lon,query"}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()

        if payload.get("status") != "success":
            return None

        country = str(payload.get("country", "")).strip()
        lat = payload.get("lat")
        lon = payload.get("lon")
        query = str(payload.get("query", ip)).strip() or ip
        if not country or lat is None or lon is None:
            return None

        return GeoLocation(ip=query, country=country, lat=float(lat), lon=float(lon))


@lru_cache(maxsize=1)
def get_geoip_service() -> GeoIPService:
    return GeoIPService(get_settings())
