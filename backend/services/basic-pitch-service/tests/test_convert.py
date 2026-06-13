"""Transport-layer tests for /convert (service mocked)."""

from __future__ import annotations

import io


def _wav_bytes(payload: bytes = b"\x00" * 64) -> io.BytesIO:
    return io.BytesIO(payload)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_convert_ok(client):
    r = client.post(
        "/convert", files={"file": ("clip.wav", _wav_bytes(), "audio/wav")}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["midi_sequence"]["n_notes"] == 1
    assert body["midi_sequence"]["tempo_bpm_estimate"] is None  # Step 1 doesn't analyze
    assert body["model"]["backend"] == "fake"
    assert body["request_id"]
    assert r.headers["x-request-id"]


def test_convert_rejects_unsupported_format(client):
    r = client.post(
        "/convert", files={"file": ("notes.txt", _wav_bytes(), "text/plain")}
    )
    assert r.status_code == 415
    assert r.json()["code"] == "unsupported_media_type"


def test_convert_rejects_empty_file(client):
    r = client.post(
        "/convert", files={"file": ("clip.wav", _wav_bytes(b""), "audio/wav")}
    )
    assert r.status_code == 422
    assert r.json()["code"] == "invalid_audio"


def test_convert_rejects_too_large(client, monkeypatch):
    from app import config

    monkeypatch.setattr(config.settings, "max_upload_bytes", 8)
    r = client.post(
        "/convert", files={"file": ("clip.wav", _wav_bytes(b"x" * 64), "audio/wav")}
    )
    assert r.status_code == 413
    assert r.json()["code"] == "payload_too_large"


def test_propagates_inbound_request_id(client):
    r = client.post(
        "/convert",
        files={"file": ("clip.wav", _wav_bytes(), "audio/wav")},
        headers={"x-request-id": "abc-123"},
    )
    assert r.json()["request_id"] == "abc-123"
    assert r.headers["x-request-id"] == "abc-123"
