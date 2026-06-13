"""Integration test for the PostgreSQL registry store.

Skipped unless ECHO_MIDI_TEST_DATABASE_URL points at a reachable Postgres whose
schema was created from backend/db/init/. The unit suite uses the in-memory store,
so this is the only coverage of the real SQL path (jsonb midi + INTEGER[] intervals,
round-trip on read, and upsert-on-conflict).

Run it against the compose database:
    docker compose up -d registry-db
    ECHO_MIDI_TEST_DATABASE_URL=postgresql://echo:echo@localhost:5432/echo \
        pytest tests/test_postgres_store.py
"""

from __future__ import annotations

import os

import pytest

DB_URL = os.getenv("ECHO_MIDI_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not DB_URL, reason="set ECHO_MIDI_TEST_DATABASE_URL to run the Postgres test"
)


_MIDI_A = {"notes": [], "duration_s": 1.0, "n_notes": 0, "tempo_bpm_estimate": None}
_MIDI_B = {"notes": [], "duration_s": 2.0, "n_notes": 0, "tempo_bpm_estimate": None}


async def test_add_and_all_roundtrip():
    from app.store import PostgresRegistryStore

    store = await PostgresRegistryStore.connect(DB_URL)
    try:
        async with store._pool.acquire() as conn:
            await conn.execute("TRUNCATE registry_tracks")  # deterministic start

        await store.add("track-a", _MIDI_A, [2, -2, 5, -1])
        await store.add("track-b", _MIDI_B, [0, 3, 3])
        await store.add("track-a", _MIDI_A, [7, 7, 7])  # upsert: replace, not duplicate

        rows = dict(await store.all_intervals())
        assert rows == {"track-a": [7, 7, 7], "track-b": [0, 3, 3]}
        assert all(isinstance(v, int) for v in rows["track-a"])  # real ints, not strings

        # The full MIDI is persisted alongside (source of truth, recomputable).
        async with store._pool.acquire() as conn:
            midi = await conn.fetchval(
                "SELECT midi FROM registry_tracks WHERE track_id = 'track-a'"
            )
        import json

        assert json.loads(midi)["duration_s"] == 1.0
    finally:
        await store.close()
