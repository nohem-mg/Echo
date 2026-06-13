# Echo — CRE Workflow

**ETH Global New York 2026 | Chainlink CRE v1.19.0+**

4-step fail-fast DAG: BasicPitch → ACRCloud ∥ MIDI private → MIDI commercial → Final Report → on-chain callback.

---

## Prerequisites

- CRE CLI ≥ v1.19.0 (`cre version` to check — update with `cre update`)
- `bun` installed
- Backend dev-gateway running on `:8080` (see below)

---

## 1. Install dependencies

```bash
cd cre/echo
bun install
```

---

## 2. Start the backend dev-gateway

The simulator calls the real backend endpoints. In a separate terminal:

```bash
# Start BasicPitch (Docker required for real MIDI conversion)
cd backend && docker compose up basic-pitch-service

# Start the dev-gateway (bridges CRE → backend microservices)
bun backend/dev-gateway/server.ts
# → listening on http://127.0.0.1:8080
```

If Docker is not running, the gateway auto-falls back to mock responses — the pipeline will still run end-to-end.

---

## 3. Simulate the workflow

Run all commands from the **project root** (`/Echo`).

### Mode A — `--listen` (recommended, no payload needed)

The simulator starts and waits for an HTTP POST on `http://localhost:2000/trigger`.

```bash
# Simulation only (no on-chain write)
/Users/nohemmg/.cre/bin/cre workflow simulate ./cre/echo \
  --target staging-settings \
  --listen \
  -e ./cre/.env \
  -R ./cre

# Then trigger it in another terminal:
curl -X POST http://localhost:2000/trigger \
  -H "Content-Type: application/json" \
  -d @cre/echo/sample-submission.json
```

### Mode B — `--listen --broadcast` (writes verdict on-chain to Sepolia)

```bash
/Users/nohemmg/.cre/bin/cre workflow simulate ./cre/echo \
  --target staging-settings \
  --listen \
  --broadcast \
  -e ./cre/.env \
  -R ./cre
```

Then trigger with the same `curl` above. The verdict will be dispatched to the Registry contract on Sepolia via `EVMClient.writeReport()`.

### Mode C — `--http-payload` (inline payload, one-shot)

```bash
/Users/nohemmg/.cre/bin/cre workflow simulate ./cre/echo \
  --target staging-settings \
  --http-payload ./cre/echo/sample-submission.json \
  -e ./cre/.env \
  -R ./cre
```

### Mode D — dev audio réel (`dev-audio-settings`)

Pour tester avec un fichier local (`file://backend/fixtures/audio/…`) sans Confidential HTTP :

```bash
# Stack backend complète (BasicPitch, ACRCloud, MIDI, registry, report)
cd backend && docker compose up

# Gateway (autre terminal)
bun backend/dev-gateway/server.ts

# Simulateur — limites HTTP étendues (Step 4 / librosa peut dépasser 10s au cold start)
/Users/nohemmg/.cre/bin/cre workflow simulate ./cre/echo \
  --target dev-audio-settings \
  --listen \
  --broadcast \
  --limits ./sim-limits-dev-audio.json \
  -e ./cre/.env \
  -R ./cre

curl -X POST http://localhost:2000/trigger \
  -H "Content-Type: application/json" \
  -d @cre/echo/sample-submission-real.json
```

> **Note :** le simulateur CRE impose par défaut `HTTPAction.ConnectionTimeout=10s`. Step 4 peut dépasser cette limite ; utilisez `--limits ./sim-limits-dev-audio.json` (90s). Le `report-service` pré-charge librosa au démarrage pour rester sous 10s quand le conteneur est déjà warm.

---

## 4. Expected output

```
[SIMULATION] Simulator Initialized
[SIMULATION] Running trigger trigger=http-trigger@1.0.0-alpha
Waiting for HTTP request to start execution (listening on http://localhost:2000/trigger)...
# ... after curl:
Step 1 — audio -> MIDI conversion (BasicPitch)
Step 2 — parallel comparison 2A ∥ 2B
Step 3 — MIDI comparison vs N commercial track(s)
Step 4 — acoustic extraction (raw audio) + final report
Final verdict: CLEAN
CRE attestation ready for callback (0x...)
CRE → Registry.onReport dispatched (gas 500000, 0xf011Bb61…)   # only with --broadcast
```

---

## 5. Run unit tests

```bash
cd cre/echo
bun test
```

Tests cover: fail-fast logic (2A/2B thresholds), HTTP error halting, Step 3 conditional skip, attestation extraction, ABI encoding, on-chain callback payload.

---

## Config files

| File | Purpose |
|---|---|
| [`config.staging.json`](./config.staging.json) | Staging: `backendBaseUrl` = `http://127.0.0.1:8080`, `useConfidentialHttp: true` |
| [`config.production.json`](./config.production.json) | Production: live backend URL, Confidential AI enabled |
| [`workflow.yaml`](./workflow.yaml) | CRE CLI target definitions (staging / production) |
| [`sample-submission.json`](./sample-submission.json) | Example trigger payload for `--listen` mode |

---

## Key invariants (see AGENTS.md)

- Never log / expose raw audio or unreleased MIDI
- Never write partial state on-chain — halt on any failure before callback
- Key / BPM extracted from raw audio only, never from MIDI
- BasicPitch converts; MIDI Comparison Algo compares (two separate steps)
- Fail-fast thresholds: 2A ≥95% → REJECTED · 2B ≥75% → SIMILAR
