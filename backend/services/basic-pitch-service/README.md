# basic-pitch-service (Echo — Step 1)

Microservice for **raw audio → MIDI** conversion via [Spotify BasicPitch](https://github.com/spotify/basic-pitch).
First link in the fail-fast DAG: it **converts, it does not analyze** (key/BPM/fingerprint
come from raw audio in Step 4; MIDI similarity is a separate service).

## API

### `POST /api/convert`
- **Input**: `multipart/form-data`, `file` field.
- **Formats**: `wav` (recommended, lossless → better transcription), `mp3`, `flac`, `ogg`, `m4a`.
  Audio is downmixed to mono and resampled to 22 050 Hz by BasicPitch (not configurable).
- **Bounds**: ≤ 50 MB, ≤ 10 min (configurable). Rejected **before** inference.
- **`200` response**:
  ```json
  {
    "midi_sequence": {
      "notes": [{"start_s": 0.51, "end_s": 0.92, "pitch": 60, "velocity": 84, "pitch_bends": null}],
      "duration_s": 184.2,
      "n_notes": 412,
      "tempo_bpm_estimate": null
    },
    "model": {"backend": "coreml", "version": "0.4.0"},
    "request_id": "uuid"
  }
  ```
- **Errors** (uniform envelope `{code, message, request_id, details?}`):

  | HTTP | `code` | Case |
  |---|---|---|
  | 415 | `unsupported_media_type` | extension not whitelisted |
  | 413 | `payload_too_large` | file over the limit |
  | 422 | `invalid_audio` / `validation_error` | empty/corrupt audio, out-of-bounds duration, malformed request |
  | 500 | `inference_error` | model failure → the CRE treats it as **STOP fail-fast** |

### `GET /health`
Simple liveness (`{"status": "ok"}`).

## Run the service (Docker — canonical)

This is **the** way to run the API. The image pins the whole stack (Python 3.11, ML
runtime, ffmpeg) → nothing to install on your machine. From `backend/`:

```bash
docker compose up --build basic-pitch-service   # build + start, port 8001 exposed
```

The API listens on `http://localhost:8001` — this is also what the CRE and other
services hit. `backend/docker-compose.yml` is the orchestration point: one block per
service as the pipeline grows.

> Image only, without compose:
> `docker build -t echo/basic-pitch . && docker run -p 8001:8001 echo/basic-pitch`

## Calling the API

```bash
# Audio -> MIDI conversion (shared fixtures under backend/fixtures/audio/)
curl -F file=@../../fixtures/audio/arpeggio.wav http://localhost:8001/api/convert
curl -F file=@../../fixtures/audio/arpeggio.mp3 http://localhost:8001/api/convert

curl http://localhost:8001/health     # liveness
open http://localhost:8001/docs        # interactive OpenAPI / Swagger docs
```

## Development & tests (local venv)

The venv is **dev-only**: hot-reload iteration and fast `pytest`. Not required to serve
the API (that's Docker's job). From this directory:

```bash
# Python 3.11 REQUIRED (see note below)
/opt/homebrew/opt/python@3.11/bin/python3.11 -m venv .venv311
source .venv311/bin/activate          # prompt shows "(.venv311)"
pip install -e ../../packages/echo-common   # shared package first
pip install -e ".[dev]"               # basic-pitch + deps (~2-4 min)

pytest                                # 8 tests: 6 unit (model mocked) + 2 integration WAV/MP3
uvicorn app.main:app --reload --port 8001   # hot-reload dev server
```

`pip`/`pytest`/`uvicorn` only exist inside the venv: re-activate it (`source …/activate`)
in each new terminal. The integration test self-skips if basic-pitch is absent.

> **Python 3.11 required.** basic-pitch 0.4.0 requires `tensorflow-macos<2.15.1` on
> Darwin py>3.11 (no wheels → 3.12/3.13/3.14 broken on Mac), and the ML stack does not
> support 3.13+ yet. On Mac, basic-pitch uses the **CoreML** backend. `setuptools<81` is
> pinned because `resampy<0.4.3` (transitive) imports `pkg_resources`, removed in
> setuptools 81+. (The `Dockerfile` already handles all this — hence Docker as default.)

## Internal architecture

```
app/
├── main.py        FastAPI app, lifespan (loads the model once), request_id middleware
├── config.py      Settings (ECHO_BP_* env vars)
├── routes.py      transport layer: validate + delegate, no business logic
├── service.py     BasicPitch.predict wrapper (testable core, HTTP-independent)
├── schemas/midi.py  output contract (MidiSequence/NoteEvent) — stable for downstream
└── core/          errors (uniform envelope) · log (JSON, never content) · audio (validation)
```

When a 2nd service joins the backend, the cross-cutting pieces in `core/` and the
`schemas/midi.py` contract will be extracted into a shared `echo-common` package.
