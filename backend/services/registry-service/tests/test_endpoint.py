"""Endpoint tests over the in-memory registry."""

from __future__ import annotations

from tests.helpers import midi_from_pitches

DISTINCTIVE = [60, 67, 65, 72, 64, 71]


def _register(client, track_id, pitches, fingerprint=None):
    body = {"track_id": track_id, "midiSequence": midi_from_pitches(pitches).model_dump()}
    if fingerprint is not None:
        body["fingerprint"] = fingerprint
    return client.post("/api/registry", json=body)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_empty_registry(client):
    r = client.get("/api/registry/intervals")
    assert r.status_code == 200
    assert r.json()["tracks"] == []


def test_register_then_list_intervals(client):
    assert _register(client, "track-1", DISTINCTIVE, {"key": "A", "bpm": 120}).status_code == 200
    r = client.get("/api/registry/intervals")
    tracks = r.json()["tracks"]
    assert len(tracks) == 1
    assert tracks[0]["track_id"] == "track-1"
    # intervals = consecutive pitch diffs of the skyline melody
    assert tracks[0]["intervals"] == [7, -2, 7, -8, 7]


def test_register_is_upsert(client):
    _register(client, "track-1", DISTINCTIVE)
    _register(client, "track-1", [60, 62, 64])  # same id, new melody
    tracks = client.get("/api/registry/intervals").json()["tracks"]
    assert len(tracks) == 1  # replaced, not duplicated
