# registry-service (Echo private registry)

Owns the **private registry of sealed tracks** (PostgreSQL). It is the single owner of
that data: written **once per track at SEAL** (by the CRE, verdict CLEAN) and read by
`midi-similarity-service` for Step 2B comparison. The pipeline computes (convert, check,
compare) persist nothing — only SEAL writes here.

## What a record holds

One row per sealed track:
- `midi` (JSONB) — full MidiSequence, **source of truth** (lets features be recomputed if
  the similarity algorithm changes, without re-ingesting).
- `intervals` (INTEGER[]) — precomputed skyline intervals, the **cached feature** served to
  midi-similarity so comparison never re-extracts.
- `fingerprint` (JSONB, nullable) — audio fingerprint, set at SEAL; null until the upstream
  producer (Step 2A / Step 4) is wired.

## API

### `POST /api/registry`
Persist a sealed track. Body `{ track_id, midiSequence, fingerprint? }`. Computes the
intervals from the MIDI and stores all three. Upsert on `track_id`.

### `GET /api/registry/intervals`
`{ tracks: [{ track_id, intervals }] }` — the cached features midi-similarity scores against.

### `GET /health`
Liveness.

## Storage

`RegistryStore` interface, two backends: **PostgreSQL** (production) and **in-memory**
(tests / local dev). With no `ECHO_REGISTRY_DATABASE_URL`, runs in-memory.

The **schema is owned by the database**: `backend/db/init/*.sql` runs once on first cluster
init (mounted at `/docker-entrypoint-initdb.d/`). The service issues DML only, never DDL.
To change the schema, edit the SQL and recreate the volume (`docker compose down -v`).

## Run (Docker, from `backend/`)

```bash
docker compose up --build registry-service   # also starts registry-db (port 8004)
```

## Development & tests (local venv)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ../../packages/echo-common
pip install -e ".[dev]"
pytest          # endpoints over the in-memory store; Postgres test self-skips without a DB
```

To exercise the real PostgreSQL path (jsonb + INTEGER[] round-trip, upsert):

```bash
docker compose up -d registry-db
ECHO_REGISTRY_TEST_DATABASE_URL=postgresql://echo:echo@localhost:5432/echo pytest tests/test_postgres_store.py
```
