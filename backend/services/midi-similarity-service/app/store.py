"""Private registry store.

Each registered track is persisted as:
  - midi      : the full MidiSequence (source of truth, never discarded — lets us
                recompute features if the similarity algorithm changes).
  - intervals : the precomputed skyline intervals (cached feature) so a compare
                scores against stored intervals without re-extracting from MIDI.

Two backends:
  - PostgresRegistryStore : production (the private PostgreSQL registry).
  - InMemoryRegistryStore : tests / local dev without a database.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class RegistryStore(Protocol):
    async def add(
        self, track_id: str, midi: dict[str, Any], intervals: list[int]
    ) -> None: ...
    async def all_intervals(self) -> list[tuple[str, list[int]]]: ...


class InMemoryRegistryStore:
    def __init__(self) -> None:
        self._data: dict[str, tuple[dict[str, Any], list[int]]] = {}

    async def add(
        self, track_id: str, midi: dict[str, Any], intervals: list[int]
    ) -> None:
        self._data[track_id] = (midi, intervals)

    async def all_intervals(self) -> list[tuple[str, list[int]]]:
        return [(tid, intervals) for tid, (_midi, intervals) in self._data.items()]


class PostgresRegistryStore:
    """Reads/writes the registry. The schema is owned by the database
    (backend/db/init/01_registry.sql) — this class issues DML only, never DDL."""

    def __init__(self, pool) -> None:  # asyncpg.Pool
        self._pool = pool

    @classmethod
    async def connect(cls, database_url: str) -> "PostgresRegistryStore":
        import asyncpg

        return cls(await asyncpg.create_pool(database_url))

    async def add(
        self, track_id: str, midi: dict[str, Any], intervals: list[int]
    ) -> None:
        import json

        async with self._pool.acquire() as conn:
            await conn.execute(
                # midi is nested -> JSONB ($2::jsonb cast: asyncpg sends the dumped
                # str as text and Postgres won't coerce text -> jsonb implicitly).
                # intervals is a flat int list -> native INTEGER[]; asyncpg binds a
                # Python list[int] to it directly, no serialization.
                """INSERT INTO registry_tracks (track_id, midi, intervals)
                   VALUES ($1, $2::jsonb, $3)
                   ON CONFLICT (track_id) DO UPDATE
                     SET midi = EXCLUDED.midi, intervals = EXCLUDED.intervals""",
                track_id,
                json.dumps(midi),
                intervals,
            )

    async def all_intervals(self) -> list[tuple[str, list[int]]]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch("SELECT track_id, intervals FROM registry_tracks")
        return [(r["track_id"], list(r["intervals"])) for r in rows]

    async def close(self) -> None:
        await self._pool.close()
