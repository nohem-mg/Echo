# AGENTS.md — Echo / ETH Global New York 2026

> Read this file fully before writing any code.
> Full technical context: `docs/ECHO_ETHGlobalNY_.md`
> Project overview: `README.md`

---

## Hard rules — enforce these unconditionally

- Never log, expose, or transmit raw audio or unreleased MIDI data.
- Never write partial state on-chain. If the pipeline fails at any step, abort — nothing gets written.
- Never commit `.env` or private keys. Use `.env.example` only.
- Never commit or push without an explicit request from the developer.
- Never modify a shared interface (ABI, HTTP endpoint, callback signature) without flagging it — all modules depend on each other.
- Never bypass the DAG execution order or modify the fail-fast thresholds (95 % / 75 % / 50 %).
- Never extract key, BPM, or acoustic fingerprint from MIDI. Always use raw audio.
- Never use BasicPitch for comparison. BasicPitch converts audio to MIDI only — comparison is a separate cosine algorithm.

---

## Before writing any code

1. Identify which module you are working in: `frontend/`, `contracts/`, `cre/`, `backend/`.
2. Read the corresponding section below for your module.
3. Check the inter-module interfaces — if your change affects a shared interface, stop and flag it first.
4. Run existing tests before and after your change.

---

## Network

- Chain: Ethereum Sepolia (chain ID 11155111)
- Registry contract: `0x0E0f9A9e1D5d5825F7590E04EbBcAdBFB8365148`
- LicenseEscrow contract: `0xdc6453ee06ab4ee2cca8a10bcbe3377b8ba02492`
- ABIs: `contracts/out/Registry.sol/Registry.json`, `contracts/out/LicenseEscrow.sol/LicenseEscrow.json`

---

## Module instructions

### contracts/ — Foundry / Solidity

- Run `forge build && forge test -v` after every change. Do not propose code that does not compile.
- Status enum: `SEALED=0, REVEALED=1`. There is deliberately no on-chain status for SIMILAR/REJECTED — the CRE halts those off-chain and never writes, so an entry existing at all proves it passed CLEAN.
- `onReport` is the SOLE state-creating entry point and must keep `require(msg.sender == creAddress)` (the Keystone forwarder) at all times. There is no permissionless `registerTrack`: "registered on-chain" == "passed the CRE pipeline" (requirement #1, structural). `onReport` creates AND seals the entry atomically.
- Ownership is an ephemeral `owner` key address carried in the report — never the artist's real wallet and never `msg.sender`. The artist proves ownership later by signing (see `revealTrack`). Do not reintroduce `msg.sender`-based ownership.
- World ID humanity is enforced UPSTREAM at the agent gate (AgentKit), off-chain. The nullifier is NOT stored on-chain for now (same per human → would correlate an artist's tracks). This is a deferred choice, not a ban — it may be added later (e.g. alongside the AgentKit human-check) if a use case needs on-chain anti-Sybil.
- If you change the ABI, immediately flag it to `frontend/` (Cyriac) and `cre/` (Nohem) — they depend on it.
- `creAddress` is currently set to the deployer as a placeholder. Do not treat it as final.

### cre/ — Chainlink CRE SDK / TypeScript

- You are the only module that writes to the Registry, via `EVMClient.writeReport` → Keystone forwarder → `Registry.onReport`. This is the single on-chain write for a track (it both creates and seals).
- Always call the backend endpoints in this exact order and parallelism: Step 1 → (2A ∥ 2B) → Step 3 (after 2A) → Step 4 (after 2B + 3).
- If any step returns an HTTP error or timeout, halt the workflow immediately. Do not call the next step.
- Apply fail-fast thresholds before calling the next step: 2A ≥95 % → REJECTED, 2B ≥75 % → SIMILAR.
- Never write on-chain if verdict is SIMILAR or REJECTED — those halt off-chain and produce no transaction. Only CLEAN reaches `onReport`.
- The report payload is `abi.encode(address owner, bytes32 commitmentHash, bytes32 registryRef)`. No verdict byte (reaching the chain already means CLEAN); no nullifier. `owner` is the artist's ephemeral owner-key address, supplied by the frontend in `PipelineInput`.

### frontend/ — Next.js / wagmi

- Connect to the Registry using the ABI at `contracts/out/Registry.sol/Registry.json`.
- The frontend does NOT write the track on-chain. There is no `registerTrack`. The track is created+sealed only by the CRE's `onReport` after a CLEAN verdict. The frontend's job is to (a) derive/manage the ephemeral `owner` key, (b) pass `owner` into `PipelineInput` so the CRE can put it in the report, and (c) compute `trackId = keccak256(abi.encode(owner, commitmentHash))` locally for display/lookup during analysis (it exists on-chain only once sealed).
- The `owner` key is ephemeral and unlinkable to the artist's real wallet — ideally derived deterministically (sign a fixed message with the wallet / use the Unlink account) so the artist can re-derive it without storing it, while the address stays uncorrelated.
- `revealTrack(bytes32 trackId, bytes32 fullProfileHash, bytes ownerSig)` is authorized by an EIP-191 signature from the `owner` key over `keccak256(abi.encode(trackId, fullProfileHash))`, NOT by `msg.sender`. Any account (or an Unlink relay) may submit the tx.
- Unlink scope: on-chain account privacy only. With the CRE as sole writer the seal is already private (the DON writes it; only the ephemeral `owner` appears). Unlink's role is the money trail — funding the owner key and private license settlement. It does NOT do x402, file/SoundCloud uploads, or audio transit — SoundCloud publishing is the separate `soundcloud-service`.

### backend/ — Express / Next.js / Python

- Store private registry tracks and melodic intervals in PostgreSQL (`registry-db` service) instead of Walrus.
- `registryRef` carried in the CRE report must be `keccak256(track_id)`.
- Database access: Schema is managed by the database container itself; applications perform data access only. Direct database access is restricted to the similarity service API (`POST /api/registry` and `POST /api/compare/private`); the CRE does not connect to the database.
- `commitmentHash` must be computed as `keccak256(abi.encodePacked(fingerprint, profileJSON))` and carried into the pipeline so the CRE seals it on-chain.
- World ID proof validation: call `POST /api/v4/verify/{rp_id}` on the Developer Portal before passing the nullifier to the frontend.
- Never return confidence scores below 50 % from `/api/check/public` — filter them out before responding.

---

## Shared interface contracts — never break these

### Backend → CRE

| Endpoint                       | Input                                                              | Output                                                             |
| --------------------------------| --------------------------------------------------------------------| --------------------------------------------------------------------|
| `POST /api/convert`            | `{ audioFile }`                                                    | `{ midiSequence }`                                                 |
| `POST /api/check/public`       | `{ audioFile }`                                                    | `{ matches: [{ ISRC, confidence_score }] }`                        |
| `POST /api/compare/private`    | `{ midiSequence }`                                                 | `{ registry_matches: [{ track_id, similarity_score }] }`           |
| `POST /api/compare/commercial` | `{ midiSequence, ISRCs[] }`                                        | `{ commercial_deltas: [{ ISRC, melodic, rhythmic, structural }] }` |
| `POST /api/report`             | `{ audioFile, midiSequence, registry_matches, commercial_deltas }` | `{ verdict, submitted_track, similar_tracks[], ai_summary }`       |

### CRE → Contract

```
Registry.onReport(bytes metadata, bytes rawReport)   // delivered by the Keystone forwarder

rawReport = abi.encode(address owner, bytes32 commitmentHash, bytes32 registryRef)
trackId   = keccak256(abi.encode(owner, commitmentHash))   // derived on-chain
// CLEAN only — SIMILAR/REJECTED never reach the chain
```

### Frontend → Contract

```
// No write path. The frontend never creates the entry — the CRE's onReport does.
// Read:   getEntry(bytes32 trackId) → Entry{ commitmentHash, timestamp, status, registryRef, owner }
//         getOwnerTracks(address owner) → bytes32[]
// Reveal: revealTrack(bytes32 trackId, bytes32 fullProfileHash, bytes ownerSig)
//         ownerSig = EIP-191 signature by `owner` over keccak256(abi.encode(trackId, fullProfileHash))
```

---

