"""Private registry store.

Holds the melodic interval sequence of every registered track. Two backends:
  - PostgresRegistryStore : production (the private PostgreSQL registry).
  - InMemoryRegistryStore : tests / local dev without a database.

We persist the precomputed interval sequence (not raw MIDI) so comparison never
re-extracts features — a compare is just scoring the query against stored intervals.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class RegistryStore(Protocol):
    async def add(self, track_id: str, intervals: list[int]) -> None: ...
    async def all(self) -> list[tuple[str, list[int]]]: ...


class InMemoryRegistryStore:
    def __init__(self) -> None:
        self._data: dict[str, list[int]] = {}

    async def add(self, track_id: str, intervals: list[int]) -> None:
        self._data[track_id] = intervals

    async def all(self) -> list[tuple[str, list[int]]]:
        return list(self._data.items())


_SCHEMA = """
CREATE TABLE IF NOT EXISTS registry_tracks (
    track_id   TEXT PRIMARY KEY,
    intervals  JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


class PostgresRegistryStore:
    def __init__(self, pool) -> None:  # asyncpg.Pool
        self._pool = pool

    @classmethod
    async def connect(cls, database_url: str) -> "PostgresRegistryStore":
        import asyncpg

        pool = await asyncpg.create_pool(database_url)
        async with pool.acquire() as conn:
            await conn.execute(_SCHEMA)
        return cls(pool)

    async def add(self, track_id: str, intervals: list[int]) -> None:
        import json

        async with self._pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO registry_tracks (track_id, intervals) VALUES ($1, $2)
                   ON CONFLICT (track_id) DO UPDATE SET intervals = EXCLUDED.intervals""",
                track_id,
                json.dumps(intervals),
            )

    async def all(self) -> list[tuple[str, list[int]]]:
        import json

        async with self._pool.acquire() as conn:
            rows = await conn.fetch("SELECT track_id, intervals FROM registry_tracks")
        return [(r["track_id"], json.loads(r["intervals"])) for r in rows]

    async def close(self) -> None:
        await self._pool.close()
