"""Transport + mapping tests for /api/soundcloud/upload (SoundCloud call mocked)."""

from __future__ import annotations

import io
import json


def _audio(payload: bytes = b"\x00" * 64) -> io.BytesIO:
    return io.BytesIO(payload)


def _meta(**kwargs) -> str:
    base = {
        "title": "My Sealed Track",
        "description": "Registered via Echo Protocol",
        "privacy": "private",
        "access_token": "sc-test-token-123",
    }
    base.update(kwargs)
    return json.dumps(base)


# ---------------------------------------------------------------------------
# Meta tests
# ---------------------------------------------------------------------------


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_upload_success(client, patch_upload):
    from tests.conftest import SC_TRACK_PAYLOAD

    patch_upload(SC_TRACK_PAYLOAD)
    r = client.post(
        "/api/soundcloud/upload",
        files={"file": ("track.mp3", _audio(), "audio/mpeg")},
        data={"metadata": _meta()},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["track_id"] == 123456789
    assert body["permalink"] == "my-sealed-track"
    assert body["soundcloud_url"] == "https://soundcloud.com/echo-artist/my-sealed-track"
    assert body["request_id"]  # injected by middleware


def test_upload_public_privacy(client, patch_upload):
    from tests.conftest import SC_TRACK_PAYLOAD

    patch_upload({**SC_TRACK_PAYLOAD, "sharing": "public"})
    r = client.post(
        "/api/soundcloud/upload",
        files={"file": ("track.wav", _audio(), "audio/wav")},
        data={"metadata": _meta(privacy="public")},
    )
    assert r.status_code == 200


def test_upload_uses_configured_access_token(client, patch_upload, monkeypatch):
    from tests.conftest import SC_TRACK_PAYLOAD

    patch_upload(SC_TRACK_PAYLOAD)
    monkeypatch.setattr(client.app.state.service._s, "access_token", "configured-token")
    meta = json.dumps({"title": "Configured Token", "privacy": "private"})
    r = client.post(
        "/api/soundcloud/upload",
        files={"file": ("track.mp3", _audio(), "audio/mpeg")},
        data={"metadata": meta},
    )
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Validation errors
# ---------------------------------------------------------------------------


def test_upload_missing_access_token(client):
    """access_token is required from metadata or service env."""
    meta = json.dumps({"title": "No Token", "privacy": "private"})
    r = client.post(
        "/api/soundcloud/upload",
        files={"file": ("track.mp3", _audio(), "audio/mpeg")},
        data={"metadata": meta},
    )
    assert r.status_code == 502
    assert r.json()["code"] == "configuration_error"


def test_upload_invalid_metadata_json(client):
    """Non-JSON metadata string → 422."""
    r = client.post(
        "/api/soundcloud/upload",
        files={"file": ("track.mp3", _audio(), "audio/mpeg")},
        data={"metadata": "not-json"},
    )
    assert r.status_code == 422


def test_upload_unsupported_format(client):
    """Text file → 415 unsupported_media_type."""
    r = client.post(
        "/api/soundcloud/upload",
        files={"file": ("doc.txt", _audio(), "text/plain")},
        data={"metadata": _meta()},
    )
    assert r.status_code == 415
    assert r.json()["code"] == "unsupported_media_type"


# ---------------------------------------------------------------------------
# Upstream errors
# ---------------------------------------------------------------------------


def test_upload_upstream_error(client, patch_upload_error):
    """SoundCloud 500 → 502 upstream_error."""
    r = client.post(
        "/api/soundcloud/upload",
        files={"file": ("track.mp3", _audio(), "audio/mpeg")},
        data={"metadata": _meta()},
    )
    assert r.status_code == 502
    assert r.json()["code"] == "upstream_error"


def test_upload_auto_refresh(client, monkeypatch):
    """401 on first call → refresh → retry succeeds."""
    call_count = 0

    async def upload_side_effect(self, audio_path, req):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            from echo_common.errors import UpstreamError
            raise UpstreamError("SoundCloud access_token is invalid or expired.", code="unauthorized")
        return {
            "soundcloud_url": "https://soundcloud.com/artist/track",
            "track_id": 123,
            "permalink": "track",
        }

    async def mock_refresh(self, refresh_token):
        return {"access_token": "new_token", "refresh_token": "new_refresh"}

    monkeypatch.setattr(
        "app.service.SoundCloudService._upload_to_api", upload_side_effect
    )
    monkeypatch.setattr(
        "app.service.SoundCloudService.refresh_token", mock_refresh
    )

    audio = b"fake-audio"
    metadata = json.dumps({
        "title": "Test",
        "access_token": "expired_token",
        "refresh_token": "valid_refresh",
    })
    r = client.post(
        "/api/soundcloud/upload",
        files={"file": ("test.mp3", audio, "audio/mpeg")},
        data={"metadata": metadata},
    )
    assert r.status_code == 200
    assert call_count == 2


def test_upload_refresh_missing_token(client, monkeypatch):
    """401 without refresh_token → error propagates."""
    from echo_common.errors import UpstreamError

    async def always_401(self, audio_path, req):
        raise UpstreamError("SoundCloud access_token is invalid or expired.", code="unauthorized")

    monkeypatch.setattr(
        "app.service.SoundCloudService._upload_to_api", always_401
    )

    audio = b"fake-audio"
    metadata = json.dumps({
        "title": "Test",
        "access_token": "expired_token",
        # no refresh_token
    })
    r = client.post(
        "/api/soundcloud/upload",
        files={"file": ("test.mp3", audio, "audio/mpeg")},
        data={"metadata": metadata},
    )
    assert r.status_code == 502
