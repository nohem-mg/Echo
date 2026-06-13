# midi-similarity-service (Echo — Step 2B)

Microservice for **compositional similarity** of a submission against the **private Echo
registry**. This is the heart of the prior-art check: it works on the *composition*
(the MIDI melody), so it catches a melody that was **re-recorded/re-arranged** — exactly
what acoustic matching (2A, Shazam-like) cannot. No third party, no external dependency,
deterministic → reproducible in the TEE.

## How the score works

See `backend/docs/reference/music-plagiarism-cases.md` for the case-law rationale.

1. **Skyline melody** — BasicPitch returns a blended polyphonic note cloud (it does *not*
   separate instruments), so we approximate the lead line by taking the highest pitch per
   onset.
2. **Intervals** — differences between consecutive melody pitches → **transposition-invariant**.
3. Two explainable signals, combined as `max`:
   - **global_overlap** — cosine over interval n-grams (substantial overall reuse).
   - **hook** — longest local alignment (Smith-Waterman), gated to ≥6 notes so coincidental
     short runs never trigger ("4 notes" is not plagiarism).
4. **Anti-banality** — trivial shapes (scales, chromatic lines, repeated notes — *Stairway*,
   *Dark Horse*) are discarded so commonplace material never flags.

> Future: data-driven distinctiveness (TF-IDF over a seeded MIDI corpus) and an n-gram
> pre-filter for scale. Not needed while the registry is small.

## API

### `POST /api/compare/private`
Body `{ "midiSequence": <MidiSequence> }` → the CRE reads `track_id` + `similarity_score`
against the SIMILAR threshold (≥75).
```json
{
  "registry_matches": [
    {"track_id": "abc", "similarity_score": 88.0, "global_overlap": 41.2, "hook": 88.0, "hook_intervals": 11}
  ],
  "request_id": "uuid"
}
```

### `POST /api/registry`
Body `{ "track_id": "...", "midiSequence": <MidiSequence> }` — adds a track's melody to the
private registry (ingestion path, e.g. when a track is SEALED).

### `GET /health`
Liveness.

## Registry store

`RegistryStore` interface with two backends: **PostgreSQL** (production) and **in-memory**
(tests / local dev). With no `ECHO_MIDI_DATABASE_URL`, the service runs on the in-memory
store. `docker compose up` provides a Postgres (`registry-db`) automatically.

The **schema is owned by the database**, not the app: `backend/db/init/*.sql` runs once on
first cluster init (mounted at `/docker-entrypoint-initdb.d/`). The service issues DML only,
never DDL. To change the schema, edit the SQL and recreate the volume (`docker compose down -v`).

## Run (Docker, from `backend/`)

```bash
docker compose up --build midi-similarity-service   # also starts registry-db (port 8003)
```

## Development & tests (local venv)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ../../packages/echo-common
pip install -e ".[dev]"
pytest          # 11 tests: similarity algorithm (case-law cases) + endpoints, no DB needed
```

To also exercise the real PostgreSQL path (the `$2::jsonb` cast, jsonb round-trip, upsert):

```bash
docker compose up -d registry-db
ECHO_MIDI_TEST_DATABASE_URL=postgresql://echo:echo@localhost:5432/echo pytest tests/test_postgres_store.py
```
