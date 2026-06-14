"""report-service endpoint tests."""

from __future__ import annotations

from pathlib import Path

import pytest

FIXTURE = Path(__file__).resolve().parents[3] / "fixtures" / "audio" / "arpeggio.wav"


@pytest.fixture
def arpeggio_bytes():
    return FIXTURE.read_bytes()


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_report_clean_no_matches(client, arpeggio_bytes):
    r = client.post(
        "/api/report",
        files={"file": ("arpeggio.wav", arpeggio_bytes, "audio/wav")},
        data={
            "registry_matches": "[]",
            "commercial_deltas": "[]",
            "midiSequence": '{"notes":[],"duration_s":0,"n_notes":0}',
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] == "CLEAN"
    assert body["similar_tracks"] == []
    assert "Mocked AI summary" in body["ai_summary"]
    assert body["can_seal"] is True


def test_report_similar_from_commercial(client, arpeggio_bytes):
    deltas = '[{"ISRC":"FRX123","melodic":80,"rhythmic":78,"structural":76}]'
    r = client.post(
        "/api/report",
        files={"file": ("arpeggio.wav", arpeggio_bytes, "audio/wav")},
        data={
            "registry_matches": "[]",
            "commercial_deltas": deltas,
            "midiSequence": '{"notes":[],"duration_s":0,"n_notes":0}',
        },
    )
    body = r.json()
    assert body["verdict"] == "SIMILAR"
    assert body["similar_tracks"][0]["source"] == "ACRCloud"
    assert body["similar_tracks"][0]["score"] >= 75
    assert body["can_seal"] is False


def test_report_similar_from_registry(client, arpeggio_bytes):
    registry = '[{"track_id":"123","similarity_score":80,"melodic":72,"rhythmic":81,"structural":55,"hook_intervals":6,"global_overlap":100,"hook":50}]'
    r = client.post(
        "/api/report",
        files={"file": ("arpeggio.wav", arpeggio_bytes, "audio/wav")},
        data={
            "registry_matches": registry,
            "commercial_deltas": "[]",
            "midiSequence": '{"notes":[],"duration_s":0,"n_notes":0}',
        },
    )
    body = r.json()
    assert body["verdict"] == "SIMILAR"
    assert body["similar_tracks"][0]["source"] == "Private Registry"
    assert body["similar_tracks"][0]["score"] == 80.0
    assert body["similar_tracks"][0]["hook_intervals"] == 6
    assert body["similar_tracks"][0]["global_overlap"] == 100.0
    assert body["similar_tracks"][0]["hook"] == 50.0
    assert body["can_seal"] is False
