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

## Owns no data — reads the registry over HTTP

This service is **pure compute**. The sealed-track registry lives in **registry-service**;
at compare time this service fetches the cached intervals from it
(`GET /api/registry/intervals`, configured via `ECHO_MIDI_REGISTRY_URL`) and scores the
query against them. It holds no database. Feature extraction (`skyline_intervals`) is shared
via `echo-common` so the registry and this service compute intervals identically.

## Run (Docker, from `backend/`)

```bash
docker compose up --build midi-similarity-service   # also starts registry-service + registry-db
```

## Development & tests (local venv)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ../../packages/echo-common
pip install -e ".[dev]"
pytest          # 11 tests: similarity algorithm (case-law cases) + endpoints; registry stubbed, no network
```
