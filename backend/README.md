# Echo backend

Echo pipeline microservices. Each step of the fail-fast DAG is an
independent FastAPI service; the CRE orchestrates them over HTTP. Services share
cross-cutting code through the `echo-common` package — no duplication, no schema drift.

## Layout

```
backend/
├── docker-compose.yml          # orchestrator: one block per service
├── db/init/                    # registry schema, owned by the DB (run once on init)
├── packages/
│   └── echo-common/            # shared: error envelope, JSON logging, audio validation,
│                               #         app factory, MIDI contract, skyline feature extraction
└── services/
    ├── basic-pitch-service/      # Step 1  — audio -> MIDI                   (port 8001)
    ├── acrcloud-service/         # Step 2A — fingerprint vs ACRCloud         (port 8002)
    ├── midi-similarity-service/  # Step 2B — composition vs registry (compute) (port 8003)
    ├── registry-service/         # private registry of sealed tracks (owns DB) (port 8004)
    ├── report-service/           # Step 4  — key/BPM extraction + final report (port 8005)
    └── soundcloud-service/       # post-SEAL — publish to SoundCloud         (port 8006)
```

`registry-service` owns the PostgreSQL registry (written at SEAL, read by
midi-similarity for comparison). Still to come: Step 3 (commercial disambiguation, see
`docs/adr/0001`). Each new step is a folder under `services/` reusing `echo-common`.

## Run everything (Docker)

```bash
docker compose up --build            # all services
docker compose up --build acrcloud-service   # just one
```

Build context is `backend/` so each image bundles `echo-common` with its service.

To drive the pipeline through the CRE (dev):

```bash
bun backend/dev-gateway/server.ts    # CRE-facing API on :8080 (services up first)
cd cre && cre workflow simulate echo --target staging-settings \
    --http-payload ./echo/sample-submission.json --trigger-index 0 --non-interactive
```

The CRE staging config already points at `http://127.0.0.1:8080` (`cre/echo/config.staging.json`).

## Develop a single service

Each service has its own venv and its own README with exact commands. The pattern:

```bash
cd services/<service>
python3 -m venv .venv && source .venv/bin/activate
pip install -e ../../packages/echo-common    # shared package first
pip install -e ".[dev]"
pytest
```

> `basic-pitch-service` requires **Python 3.11** (ML stack constraint — see its README).
> Other services work on any modern Python.

## Conventions

- **Service boundaries**: one service = one DAG step = one CRE endpoint. Keep logic in
  `service.py` (HTTP-independent, testable); routes only validate and delegate.
- **Confidentiality**: never log raw audio or MIDI (the shared logger enforces this).
- **Shared contracts** live in `echo-common`; changing one affects every consumer.
