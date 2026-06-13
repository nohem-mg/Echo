# acrcloud-service (Echo — Step 2A)

Microservice for **acoustic fingerprinting against ACRCloud's public database**.
Runs in parallel with Step 2B in the fail-fast DAG. Given raw audio, it returns
the matching recordings with their ISRC and confidence score; the CRE reads the
score against the thresholds (≥95 → REJECTED, 50–94 → Step 3, <50 → Step 3 skipped).

## Privacy: the raw audio is never sent

The track is confidential, so we never ship it to a third party. We extract
**irreversible fingerprints locally** (ACRCloud's native extractor — an acoustic one
and a humming one) and send **only those** to ACRCloud — the song cannot be
reconstructed from them. Combined with the TEE the service runs in and TLS in transit,
the audio never leaves the enclave in any recoverable form.

## API

### `POST /api/check/public`
- **Input**: `multipart/form-data`, `file` field (`wav`/`mp3`/`flac`/`ogg`/`m4a`, ≤ 50 MB).
  Fingerprinted locally; only the fingerprint is sent upstream (see Privacy below).
- **Two fingerprints, one call** (privacy-first, audio never sent):
  - `matches` — **exact acoustic** matches (same master). `ISRC` + `confidence_score`
    drive the CRE thresholds.
  - `cover_matches` — **melodic/cover** matches (same composition, different recording),
    via the humming engine. Candidates for Step 3's compositional comparison. Empty
    unless the **Humming bucket** is enabled on the ACRCloud project.
- **`200` response** (extra fields beyond ISRC/score are context for the report, Step 4):
  ```json
  {
    "matches": [
      {
        "ISRC": "USABC1234567", "confidence_score": 97,
        "title": "Some Song", "artists": ["Some Artist"],
        "album": "Some Album", "label": "Some Label",
        "release_date": "2021-05-01", "duration_ms": 210000
      }
    ],
    "cover_matches": [
      {"ISRC": "USXYZ7654321", "confidence_score": 82, "title": "A Cover", "artists": ["Cover Artist"]}
    ],
    "request_id": "uuid"
  }
  ```
  No match → `{"matches": [], "cover_matches": [], ...}`.
- **Errors** (uniform envelope `{code, message, request_id, details?}`):

  | HTTP | `code` | Case |
  |---|---|---|
  | 415 | `unsupported_media_type` | extension not whitelisted |
  | 413 | `payload_too_large` | file over the limit |
  | 502 | `upstream_error` | ACRCloud failed/timed out or not configured → CRE STOP fail-fast |

### `GET /health`
Simple liveness (`{"status": "ok"}`).

## Run (Docker, from `backend/`)

```bash
docker compose up --build acrcloud-service   # port 8002
```

Set the ACRCloud credentials in `.env.example` (or a real `.env`):
`ECHO_ACR_HOST`, `ECHO_ACR_ACCESS_KEY`, `ECHO_ACR_ACCESS_SECRET`.

## Calling it

```bash
curl -F file=@some_audio.wav http://localhost:8002/api/check/public
```

## Development & tests (local venv)

No ML stack here, so any modern Python works:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ../../packages/echo-common   # shared package first
pip install -e ".[dev]"
pytest                                       # 6 tests; network mocked, fingerprint extraction real
```
