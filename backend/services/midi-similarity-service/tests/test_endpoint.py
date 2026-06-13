"""Endpoint tests. The registry is a stub dict (see conftest); compare hits the real
service logic, registration is simulated by populating the stub with skyline intervals."""

from __future__ import annotations

from echo_common.midi_features import skyline_intervals
from tests.helpers import midi_from_pitches

DISTINCTIVE = [60, 67, 65, 72, 64, 71, 62, 69, 60, 68]
OTHER = [61, 58, 73, 55, 74, 59, 70, 56, 63, 57]


def _seed(registry, track_id, pitches):
    """Simulate a track sealed in the registry (registry-service would store this)."""
    registry[track_id] = skyline_intervals(midi_from_pitches(pitches))


def _compare(client, pitches):
    return client.post(
        "/api/compare/private",
        json={"midiSequence": midi_from_pitches(pitches).model_dump()},
    )


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_empty_registry_no_matches(client):
    r = _compare(client, DISTINCTIVE)
    assert r.status_code == 200
    assert r.json()["registry_matches"] == []


def test_match(client, registry):
    _seed(registry, "track-1", DISTINCTIVE)
    body = _compare(client, DISTINCTIVE).json()
    assert body["registry_matches"][0]["track_id"] == "track-1"
    assert body["registry_matches"][0]["similarity_score"] == 100.0
    assert body["request_id"]


def test_unrelated_submission_below_floor(client, registry):
    _seed(registry, "track-1", DISTINCTIVE)
    matches = _compare(client, OTHER).json()["registry_matches"]
    assert all(m["track_id"] != "track-1" or m["similarity_score"] < 75 for m in matches)


def test_matches_sorted_desc(client, registry):
    _seed(registry, "exact", DISTINCTIVE)
    _seed(registry, "unrelated", OTHER)
    matches = _compare(client, DISTINCTIVE).json()["registry_matches"]
    scores = [m["similarity_score"] for m in matches]
    assert scores == sorted(scores, reverse=True)
    assert matches[0]["track_id"] == "exact"
