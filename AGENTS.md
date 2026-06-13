# AGENTS.md — Echo / ETH Global New York 2026

> Read this file fully before writing any code.
> Full technical context: `docs/Echo_ETHGlobalNY2026_FR_v3.md`
> Task breakdown: `docs/Echo_Tasks_CNM.md`

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
- Registry contract: `0x52eE9af7918c69Ab4DC08b9C0b2a82C24Fd6DC6C`
- ABI: `contracts/out/Registry.sol/Registry.json`

---

## Module instructions

### contracts/ — Foundry / Solidity

- Run `forge build && forge test -v` after every change. Do not propose code that does not compile.
- The Status enum values are fixed — never change them: `SEALED=0, REVEALED=1, SIMILAR=2, REJECTED=3`.
- `onlyCRE` must protect `receiveCRECallback` at all times. Never remove or weaken this modifier.
- World ID proof is validated off-chain by the backend. The contract stores the nullifier only for anti-Sybil. Do not reintroduce on-chain ZK proof verification.
- If you change the ABI, immediately flag it to `frontend/` (Cyriac) and `cre/` (Nohem) — they depend on it.
- `creAddress` is currently set to the deployer as a placeholder. Do not treat it as final.

### cre/ — Chainlink CRE SDK / TypeScript

- You are the only module authorized to call `receiveCRECallback` on the Registry.
- Always call the backend endpoints in this exact order and parallelism: Step 1 → (2A ∥ 2B) → Step 3 (after 2A) → Step 4 (after 2B + 3).
- If any step returns an HTTP error or timeout, halt the workflow immediately. Do not call the next step.
- Apply fail-fast thresholds before calling the next step: 2A ≥95 % → REJECTED, 2B ≥75 % → SIMILAR.
- Never write on-chain if verdict is SIMILAR or REJECTED.
- The callback signature is: `receiveCRECallback(bytes32 trackId, uint8 verdict, bytes rawReport)`.

### frontend/ — Next.js / wagmi

- Connect to the Registry using the ABI at `contracts/out/Registry.sol/Registry.json`.
- Do not call `registerTrack` before the backend has validated the World ID proof.
- Always store the `trackId` returned by `registerTrack` — it is required for the certificate and reveal flow.
- `registerTrack` signature: `(uint256 nullifier, bytes32 commitmentHash, bytes32 registryRef)`.
- `revealTrack` can only be called by the wallet that originally called `registerTrack` for that track.

### backend/ — Express / Next.js / Python

- Store MIDI sequences encrypted in PostgreSQL. Do not use Walrus.
- `registryRef` passed to `registerTrack` must be `keccak256` of the MIDI entry's primary key in the DB.
- `commitmentHash` must be computed as `keccak256(abi.encodePacked(fingerprint, profileJSON))` before calling `registerTrack`.
- World ID proof validation: call `POST /api/v4/verify/{rp_id}` on the Developer Portal before passing the nullifier to the frontend.
- Never return confidence scores below 50 % from `/api/check/public` — filter them out before responding.

---

## Shared interface contracts — never break these

### Backend → CRE

| Endpoint | Input | Output |
|---|---|---|
| `POST /api/convert` | `{ audioFile }` | `{ midiSequence }` |
| `POST /api/check/public` | `{ audioFile }` | `{ matches: [{ ISRC, confidence_score }] }` |
| `POST /api/compare/private` | `{ midiSequence }` | `{ registry_matches: [{ track_id, similarity_score }] }` |
| `POST /api/compare/commercial` | `{ midiSequence, ISRCs[] }` | `{ commercial_deltas: [{ ISRC, melodic, rhythmic, structural }] }` |
| `POST /api/report` | `{ audioFile, midiSequence, registry_matches, commercial_deltas }` | `{ verdict, submitted_track, similar_tracks[], ai_summary }` |

### CRE → Contract

```
receiveCRECallback(bytes32 trackId, uint8 verdict, bytes rawReport)

verdict: 0=CLEAN/SEALED | 2=SIMILAR | 3=REJECTED
```

### Frontend → Contract

```
registerTrack(uint256 nullifier, bytes32 commitmentHash, bytes32 registryRef) → bytes32 trackId

revealTrack(bytes32 trackId, bytes32 fullProfileHash)
```

---

