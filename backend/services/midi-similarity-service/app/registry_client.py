"""Client for registry-service — fetches the cached intervals to compare against."""

from __future__ import annotations

import httpx
from echo_common.errors import UpstreamError
from echo_common.log import get_logger

logger = get_logger(__name__)


class RegistryClient:
    def __init__(self, base_url: str, timeout_s: float) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout_s = timeout_s

    async def all_intervals(self) -> list[tuple[str, list[int]]]:
        url = f"{self._base_url}/api/registry/intervals"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_s) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.exception("registry-service request failed")
            raise UpstreamError("Could not reach the registry.") from exc
        return [(t["track_id"], t["intervals"]) for t in data["tracks"]]
