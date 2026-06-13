# Echo backend

Echo pipeline microservices. Each step of the fail-fast DAG is an
independent FastAPI service; the CRE orchestrates them over HTTP. Services share
cross-cutting code through the `echo-common` package — no duplication, no schema drift.

## Layout

```
backend/
├── docker-compose.yml          # orchestrator: one block per service
├── packages/
│   └── echo-common/            # shared: error envelope, JSON logging, audio validation,
│                               #         app factory (/health + middleware), MIDI contract
└── services/
    ├── basic-pitch-service/    # Step 1  — audio -> MIDI            (port 8001)
    └── acrcloud-service/       # Step 2A — fingerprint vs ACRCloud  (port 8002)
```

Still to come: Step 2B (midi-similarity), Step 3 (commercial compare), Step 4 (report),
storage (Walrus). Each is a new folder under `services/` reusing `echo-common`.

## Run everything (Docker)

```bash
docker compose up --build            # all services
docker compose up --build acrcloud-service   # just one
```

Build context is `backend/` so each image bundles `echo-common` with its service.

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
