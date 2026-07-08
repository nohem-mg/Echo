# Echo

**An open-source, on-chain music prior-art registry for independent artists.**

Echo lets an artist establish a timestamped, verifiable, and *confidential* proof of creation for a track — without ever exposing the unreleased audio. With the rise of AI-generated music and landmark IP lawsuits (Suno, Udio), artists need a trustless way to state "I created this first." Echo makes that possible by combining multi-agent AI similarity analysis, confidential off-chain compute, and on-chain timestamping in a fail-fast agentic pipeline.

> Built for ETH Global New York 2026. Full technical write-up: [`docs/ECHO_ETHGlobalNY_.md`](docs/ECHO_ETHGlobalNY_.md).

---

## What it does

Before releasing a track, an artist submits it to Echo. A 4-step pipeline checks it against both the public commercial catalogue and Echo's private registry, then — only if the track is **CLEAN** — seals a commitment on-chain. The audio itself never leaves the confidential environment; only an irreversible fingerprint is stored.

Echo satisfies four properties no existing registry (US Copyright Office, SACEM, a plain NFT timestamp) offers together:

- **Trustless** — no intermediary can forge, alter, or delete an entry.
- **Confidential** — the audio stays private until the artist chooses to reveal it.
- **Verifiable** — anyone can independently check the timestamp and fingerprint.
- **Sybil-resistant** — World ID gates the pipeline so one human ≠ unlimited registrations.

After sealing, an artist can optionally publish the track to SoundCloud (streamed directly, never stored at rest) and license it through a private, escrowed on-chain marketplace.

The frontend flow is: upload → World ID verify → pay the flow fee → run the pipeline.

> **Note — current build vs. original goal.** The flow fee is **mocked** in the
> current frontend build: the flow advances through `payments/create` and
> `payments/confirm` but no wallet transaction is sent (`useEchoFlow` fills a
> placeholder hash). *Originally intended:* a real Sepolia fee payment gates each
> run. *Possible follow-up:* re-enable the live payment path — the receipt-watching
> logic is still present in `useEchoFlow`, just bypassed.

---

## The pipeline (4-step DAG)

The CRE orchestrates a fail-fast directed-acyclic-graph. Steps 2A and 2B run in parallel; Step 3 starts as soon as 2A finishes; Step 4 waits for both 2B and 3.

```
STEP 1: BasicPitch (Audio → MIDI)  ─── [STOP on failure]
                  │
       ┌──────────┴──────────┐
       ▼                     ▼
 STEP 2A: ACRCloud      STEP 2B: MIDI Comparison
 fingerprint vs.        MIDI vs. private registry
 public catalogue       [≥75% → STOP: SIMILAR]
 [≥95% → STOP: copy]
 [≥85% → STOP: cover]
       │                     │
       ▼                     │
 STEP 3: score commercial    │
 matches (ACRCloud, ≥50%)    │
       │                     │
       └──────────┬──────────┘
                  ▼
 STEP 4: key + BPM (from raw audio) + fingerprint (SHA-256 of audio) → ranked report
                  │
                  ▼   verdict CLEAN → seal in private registry → on-chain (Registry.onReport)
                  │
                  ▼   (optional) publish to SoundCloud · list on the licensing marketplace
```

> **Implementation note.** Step 4 extracts key/mode/BPM from the **raw audio signal**
> (`report-service`'s `acoustic.py`: librosa chroma + tempo), and the fingerprint is
> a SHA-256 of the raw audio bytes. An explicit key/mode/BPM carried on the MIDI
> payload still takes precedence when present.

A **CLEAN** verdict does two writes: it persists the track (MIDI + fingerprint) in the off-chain **private registry** (PostgreSQL, `registry-service`), then makes the single write to the on-chain **`Registry` contract** via `Registry.onReport`. **SIMILAR / REJECTED / ERROR** halt off-chain and write nothing — so an on-chain entry existing at all proves the track passed.

| Step | Tool | Role |
| :--- | :--- | :--- |
| 1 | BasicPitch (Spotify's open-source model) | Convert raw audio → MIDI. Conversion only, no analysis. |
| 2A | ACRCloud | Acoustic fingerprint vs. public commercial catalogue. Also flags humming/cover matches (≥85%). |
| 2B | MIDI comparison | Compositional similarity (pitch intervals, not timing) vs. Echo's private registry. This is the *only* MIDI comparison in the pipeline. |
| 3 | Commercial scoring | For ACRCloud matches ≥50%, score the flagged commercial tracks (by ISRC) → melodic / rhythmic / structural deltas. Does not convert commercial audio to MIDI. |
| 4 | Acoustic analysis | Extract key/BPM from the raw audio and hash it into a fingerprint; produce the final ranked report and verdict. |

---

## Architecture

```
frontend/   Next.js / wagmi — upload, World ID verification, seal certificate, licensing marketplace
cre/        Chainlink CRE workflow — orchestrates the DAG, sole on-chain writer
backend/    FastAPI microservices (one per DAG step) + PostgreSQL private registry
contracts/  Foundry — Registry + LicenseEscrow on Ethereum Sepolia
docs/        Technical write-up and design notes
```

Each layer has its own README with detailed setup:
- [`frontend/README.md`](frontend/README.md)
- [`cre/echo/README.md`](cre/echo/README.md)
- [`backend/README.md`](backend/README.md)
- [`contracts/README.md`](contracts/README.md)

### Key building blocks

- **World ID** — proves each artist is a unique human; enforced upstream at the agent gate (not stored on-chain, to avoid correlating an artist's tracks).
- **Chainlink CRE** — runs the DAG, manages parallelism and fail-fast, and is the *only* writer to the Registry contract.
- **Chainlink Confidential AI** — routes sensitive steps through a confidential (TEE) HTTP path with per-step attestation, so unreleased audio never leaks.

  > **Note — current build vs. original goal.** Today only **Step 1 (convert)** and
  > **Step 2A (public check)** run over the confidential HTTP path, and only when a
  > deployment sets `useConfidentialHttp` (on for `staging`/`production`, off for
  > `dev-audio`). *Originally intended:* run every sensitive step (2B private
  > comparison, 3 commercial scoring, 4 report, and the registry seal) confidentially;
  > confidential variants of those steps exist in `cre/echo/confidential-steps.ts` but
  > are not yet wired into the client. *Possible follow-up:* wire the remaining
  > confidential variants, or drop them if the two-step boundary is deemed sufficient.
- **PostgreSQL** — the confidential private registry (`registry-db`); stores MIDI and melodic-interval profiles, never audio. Reachable only via the registry / similarity service APIs.
- **Unlink** — private settlement for the licensing layer only. The `LicenseEscrow` flow routes through pooled `ExecutionAccount`s so the buyer, seller, and amount stay unlinkable. Not used for registration/sealing, uploads, audio transit, or HTTP payments.
- **SoundCloud** — optional post-seal distribution. The `soundcloud-service` streams the audio straight to the SoundCloud API and never stores it at rest; this path is separate from the analysis pipeline and from Unlink.

---

## Smart contracts (Ethereum Sepolia)

| Contract | Address | Purpose |
| :--- | :--- | :--- |
| `Registry` | `0x0E0f9A9e1D5d5825F7590E04EbBcAdBFB8365148` | Prior-art claims. Stores `commitmentHash`, `timestamp`, `status` (`SEALED`/`REVEALED`), `registryRef`, and an ephemeral `owner` key. |
| `LicenseEscrow` | `0xdc6453ee06ab4ee2cca8a10bcbe3377b8ba02492` | Private OTC licensing of sealed tracks, settled in the Unlink ERC-20. |

**Registry** — `onReport` is the sole state-creating entry point (callable only by the CRE's Keystone forwarder); it creates *and* seals an entry atomically. There is no permissionless `registerTrack` — "on-chain" means "passed the pipeline." The artist proves ownership later with an EIP-191 signature from the `owner` key, so reveal/license calls can be relayed.

**LicenseEscrow** — `createListing` → `purchase` (escrow via ERC-20 `transferFrom`) → `confirmAndRelease`, with `cancel` for unsold listings. All calls route through Unlink `execute()`, so the parties stay unlinkable.

---

## Quick start

Each module runs independently. The shortest path to a running demo:

```bash
# 1. Backend services + Postgres registry
cd backend && docker compose up --build

# 2. Contracts (build / test / deploy)
cd contracts && forge build && forge test -v
forge script script/DeployEscrow.s.sol:DeployEscrow --rpc-url sepolia --broadcast   # deploy escrow

# 3. CRE workflow — see cre/echo/README.md

# 4. Frontend
cd frontend && npm install && npm run dev
```

Configure addresses for the frontend via `NEXT_PUBLIC_REGISTRY_ADDRESS`, `NEXT_PUBLIC_ESCROW_ADDRESS`, and `NEXT_PUBLIC_UNLINK_TOKEN_ADDRESS`.

---

## Confidentiality guarantees

- Raw audio and unreleased MIDI are never logged, persisted at rest, or transmitted outside the confidential environment.
- Only irreversible compositional fingerprints are stored; the on-chain entry holds only a `commitmentHash` and an opaque `registryRef`.
- The pipeline never writes partial state: any failure aborts with nothing on-chain.

See [`docs/OWNER_KEY_DERIVATION.md`](docs/OWNER_KEY_DERIVATION.md) for how the unlinkable owner key is derived.
