"""Business core: ACRCloud identification (Step 2A).

Privacy-first: the raw audio NEVER leaves this service. We extract irreversible
fingerprints locally and send only those — the song can't be reconstructed from them.

Two fingerprints in a single /v1/identify call (as ACRCloud's own SDK does):
  - ``sample``      audio fingerprint  -> exact master matches   (metadata.music)
  - ``sample_hum``  humming fingerprint -> melodic/cover matches  (metadata.humming)

The exact pass catches "this is a published recording"; the melodic pass catches
re-recordings/covers of the same composition (needs the Humming bucket enabled on
the ACRCloud project — otherwise it simply returns nothing).

HTTP-independent and testable: extraction (``_fingerprints``) and the network call
(``_identify``) are isolated so tests can patch both.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from pathlib import Path

import httpx
from echo_common.errors import InvalidAudioError, UpstreamError
from echo_common.log import get_logger

from .config import Settings
from .schemas import PublicMatch

logger = get_logger(__name__)

_ENDPOINT = "/v1/identify"
_DATA_TYPE = "fingerprint"  # signed type; the audio fingerprint is the primary sample
# ACRCloud status codes we treat as "no match" rather than failures.
_NO_RESULT_CODES = {1001}


class AcrCloudService:
    def __init__(self, settings: Settings) -> None:
        self._s = settings

    def _fingerprints(self, audio_path: Path) -> tuple[bytes, bytes | None]:
        """Extract the audio fingerprint and (optionally) the humming fingerprint."""
        from acrcloud import acrcloud_extr_tool as extr

        path, secs = str(audio_path), self._s.sample_seconds
        try:
            audio_fp = extr.create_fingerprint_by_file(path, 0, secs, False)
        except Exception as exc:  # noqa: BLE001 — any failure = unreadable audio
            raise InvalidAudioError("Could not fingerprint audio.") from exc
        if not audio_fp:
            raise InvalidAudioError("Audio too short or silent to fingerprint.")

        humming_fp: bytes | None = None
        if self._s.enable_cover:
            try:
                humming_fp = extr.create_humming_fingerprint_by_file(path, 0, secs, 2)
            except Exception:  # noqa: BLE001 — melodic pass is best-effort, never fatal
                logger.warning("Humming fingerprint extraction failed; skipping")
                humming_fp = None
        return audio_fp, (humming_fp or None)

    def _signature(self, timestamp: str) -> str:
        string_to_sign = "\n".join(
            ["POST", _ENDPOINT, self._s.access_key, _DATA_TYPE, "1", timestamp]
        )
        digest = hmac.new(
            self._s.access_secret.encode(), string_to_sign.encode(), hashlib.sha1
        ).digest()
        return base64.b64encode(digest).decode()

    async def _identify(self, audio_fp: bytes, humming_fp: bytes | None) -> dict:
        """Single network call to ACRCloud (sends fingerprints only, never audio)."""
        if not (self._s.host and self._s.access_key and self._s.access_secret):
            raise UpstreamError("ACRCloud is not configured.")

        timestamp = str(int(time.time()))
        data = {
            "access_key": self._s.access_key,
            "data_type": _DATA_TYPE,
            "signature_version": "1",
            "signature": self._signature(timestamp),
            "sample_bytes": str(len(audio_fp)),
            "timestamp": timestamp,
        }
        files = {"sample": ("fp", audio_fp)}
        if humming_fp:
            data["sample_hum_bytes"] = str(len(humming_fp))
            files["sample_hum"] = ("hum", humming_fp)

        url = f"https://{self._s.host}{_ENDPOINT}"
        try:
            async with httpx.AsyncClient(timeout=self._s.timeout_s) as client:
                resp = await client.post(url, data=data, files=files)
                resp.raise_for_status()
                return resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.exception("ACRCloud request failed")
            raise UpstreamError("ACRCloud request failed.") from exc

    async def check_public(self, audio_path: Path) -> tuple[list[PublicMatch], list[PublicMatch]]:
        audio_fp, humming_fp = self._fingerprints(audio_path)
        payload = await self._identify(audio_fp, humming_fp)
        return self._to_matches(payload, "music"), self._to_matches(payload, "humming")

    @staticmethod
    def _to_matches(payload: dict, section: str) -> list[PublicMatch]:
        status = payload.get("status", {})
        code = status.get("code")
        if code in _NO_RESULT_CODES:
            return []
        if code != 0:
            raise UpstreamError(f"ACRCloud error: {status.get('msg', 'unknown')}.")
        entries = payload.get("metadata", {}).get(section, [])
        return [_to_match(e) for e in entries]


def _to_match(entry: dict) -> PublicMatch:
    return PublicMatch(
        ISRC=entry.get("external_ids", {}).get("isrc"),
        confidence_score=float(entry.get("score", 0)),
        title=entry.get("title"),
        artists=[a["name"] for a in entry.get("artists", []) if a.get("name")],
        album=entry.get("album", {}).get("name"),
        label=entry.get("label"),
        release_date=entry.get("release_date"),
        duration_ms=entry.get("duration_ms"),
    )
