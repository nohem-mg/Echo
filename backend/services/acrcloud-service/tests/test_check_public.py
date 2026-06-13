"""Transport + mapping tests for /check/public (ACRCloud call mocked)."""

from __future__ import annotations

import io


def _wav(payload: bytes = b"\x00" * 64) -> io.BytesIO:
    return io.BytesIO(payload)


_MATCH_PAYLOAD = {
    "status": {"code": 0, "msg": "Success"},
    "metadata": {
        "music": [
            {
                "score": 97,
                "title": "Some Song",
                "external_ids": {"isrc": "USABC1234567"},
                "artists": [{"name": "Some Artist"}],
                "album": {"name": "Some Album"},
                "label": "Some Label",
                "release_date": "2021-05-01",
                "duration_ms": 210000,
            }
        ],
        "humming": [
            {
                "score": 82,
                "title": "A Cover",
                "external_ids": {"isrc": "USXYZ7654321"},
                "artists": [{"name": "Cover Artist"}],
            }
        ],
    },
}


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_check_public_maps_matches(client, patch_identify):
    patch_identify(_MATCH_PAYLOAD)
    r = client.post("/api/check/public", files={"file": ("clip.wav", _wav(), "audio/wav")})
    assert r.status_code == 200
    body = r.json()
    assert len(body["matches"]) == 1
    m = body["matches"][0]
    assert m["ISRC"] == "USABC1234567"
    assert m["confidence_score"] == 97
    assert m["title"] == "Some Song"
    assert m["artists"] == ["Some Artist"]
    assert m["album"] == "Some Album"
    # melodic/cover matches surfaced separately
    assert len(body["cover_matches"]) == 1
    cm = body["cover_matches"][0]
    assert cm["ISRC"] == "USXYZ7654321"
    assert cm["confidence_score"] == 82
    assert body["request_id"]


def test_check_public_no_result_is_empty(client, patch_identify):
    patch_identify({"status": {"code": 1001, "msg": "No result"}})
    r = client.post("/api/check/public", files={"file": ("clip.wav", _wav(), "audio/wav")})
    assert r.status_code == 200
    assert r.json()["matches"] == []


def test_check_public_upstream_error(client, patch_identify):
    patch_identify({"status": {"code": 3001, "msg": "Limit exceeded"}})
    r = client.post("/api/check/public", files={"file": ("clip.wav", _wav(), "audio/wav")})
    assert r.status_code == 502
    assert r.json()["code"] == "upstream_error"


def test_check_public_rejects_unsupported_format(client):
    r = client.post("/api/check/public", files={"file": ("a.txt", _wav(), "text/plain")})
    assert r.status_code == 415
    assert r.json()["code"] == "unsupported_media_type"
