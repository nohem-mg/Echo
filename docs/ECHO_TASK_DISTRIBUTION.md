# The Echo Protocol — Répartition des Tâches
**Task Distribution — CNM Agency Team**  
*ETH Global New York 2026*  

---
*CNM Agency — Confidentiel / June 2026*

**Team Members:**
- **CYRIAC:** Front-end & UX
- **MARIUS:** Smart Contracts
- **NOHEM:** CRE & Agents IA
- **JEAN:** Backend & Pipeline

**Task Priority Key:**
- `[MVP]` — Essential for the hackathon demo
- `[IMP]` — Important for sponsor prizes
- `[BONUS]` — Nice-to-have if time is available

---

## CYRIAC — Front-end & UX

### Dependencies
- **Marius:** Registry contract address (Base Sepolia) + ABI
- **Nohem:** CRE endpoint webhook (pipeline verdict)
- **Jean:** Backend API endpoints (`/convert`, `/compare`, `/report`)

### Tasks

#### 1. Setup & Configuration
- [ ] Init Next.js 14 project + TypeScript `[MVP]`
- [ ] Setup wagmi + viem configured on Ethereum Sepolia `[MVP]`
- [ ] Setup Tailwind CSS + design system (colors, typography) `[MVP]`
- [ ] Environment variables (`.env`): RPC URL, contract address, API keys `[MVP]`
- [ ] Wallet connection: MetaMask + World App (wagmi) `[MVP]`

#### 2. World ID
- [ ] Integrate IDKit World ID widget (v4.0) in the upload page `[MVP]`
- [ ] Retrieve proof, root, nullifierHash, externalNullifierHash → pass to backend `[MVP]`
- [ ] Manage verified / unverified state in the component `[MVP]`

#### 3. Upload & Pipeline
- [ ] Audio upload page: drag & drop WAV/MP3, format/size validation `[MVP]`
- [ ] Real-time pipeline display (Step 1 → 4) with progress statuses `[MVP]`
- [ ] Visual indicators per step: *in progress* / *OK* / *STOP* (with reason) `[MVP]`
- [ ] Handle STOP cases: obvious plagiarism (≥95%), SIMILAR (≥75%), TEE error `[MVP]`

#### 4. Comparison Report
- [ ] Final report table component: rank, title, source, global score, dimensions `[MVP]`
- [ ] Score color code: red (≥75%), orange (50–74%), green (< 50%) `[MVP]`
- [ ] Display final CLEAN / SIMILAR verdict at the top of the report `[MVP]`
- [ ] AI Summary (`ai_summary`) displayed under the table `[IMP]`

#### 5. SEALED Certificate
- [ ] Certificate page: display `commitmentHash`, timestamp, SEALED status `[MVP]`
- [ ] Etherscan link to the on-chain transaction `[MVP]`
- [ ] « Copy hash » button `[IMP]`
- [ ] « Reveal » button (SEALED → REVEALED) with wallet confirmation `[IMP]`

#### 6. SoundCloud Publish (Bonus)
- [ ] Optional post-SEAL UI: « Publish on SoundCloud » `[BONUS]`
- [ ] Title + description + privacy settings form `[BONUS]`
- [ ] Display publication confirmation with SoundCloud link `[BONUS]`

#### 7. World App Mini App (Bonus)
- [ ] Configure Mini App in World App Developer Portal `[BONUS]`
- [ ] Adapt viewport and navigation for World App (mobile-first) `[BONUS]`
- [ ] Test on World App simulator `[BONUS]`

---

## MARIUS — Smart Contracts

### Tasks

#### 1. Setup
- [ ] Init Foundry project + dependencies `[MVP]`
- [ ] Configure `.env`: Ethereum Sepolia RPC, deployer private key, Etherscan API key `[MVP]`
- [ ] *Removed:* Verify access to Base Sepolia World Router (World ID verified off-chain, no Router contract dependency on Sepolia)

#### 2. Registry Contract
- [ ] Define struct `Entry { commitmentHash, worldNullifier, timestamp, status, registryRef }` (where `registryRef` (bytes32) is the backend DB pointer, replacing `walrusBlobIds[]`) `[MVP]`
- [ ] Define mapping `trackId` → `Entry` + mapping `artist` → `trackIds[]` `[MVP]`
- [ ] Define enum `Status { SEALED, REVEALED, SIMILAR, REJECTED }` `[MVP]`
- [ ] Implement `registerTrack(nullifier, commitmentHash, registryRef, artist)` (nullifier is validated off-chain by backend) `[MVP]`
- [ ] On-chain anti-Sybil nullifier verification (`usedNullifiers` mapping) `[MVP]`
- [ ] Event `TrackRegistered(address artist, bytes32 trackId, bytes32 commitment, uint256 timestamp)` `[MVP]`
- [ ] Modifier `onlyCRE` to secure CRE callback `[MVP]`
- [ ] Function `receiveCRECallback(trackId, verdict, attestation)` — writes final status (waiting on Nohem) `[MVP]`
- [ ] Chainlink Confidential AI attestation verification in the callback `[IMP]`
- [ ] *Removed:* Listen for Unlink payment confirmation (out of scope without Walrus prize track)
- [ ] Function `revealTrack(trackId, fullProfileHash, artist)` — transition from SEALED → REVEALED `[IMP]`

#### 3. Security & Tests
- [ ] Test: `registerTrack` with valid nullifier → success `[MVP]`
- [ ] *Removed:* Test: `registerTrack` with invalid World ID (handled off-chain)
- [ ] Test: double registration with the same nullifier → revert (anti-Sybil) `[MVP]`
- [ ] Test: CRE callback with wrong caller → revert `[MVP]`
- [ ] Test: `revealTrack` by correct artist → success `[IMP]`
- [ ] Test: `revealTrack` by third party → revert `[IMP]`

#### 4. Deployment
- [ ] Deploy Registry contract on Ethereum Sepolia `[MVP]`
- [ ] Verify contract on Etherscan `[MVP]`
- [ ] Share address + ABI with Cyriac and Nohem `[MVP]`
- [ ] Test manual `registerTrack` call via cast or Etherscan `[MVP]` (To Do)
- [ ] Redeploy with Nohem's real CRE address `[MVP]` (Waiting on Nohem)
- [ ] Redeploy with artist parameter + Unlink compatibility `[IMP]`

---

## NOHEM MONNET-GANI — CRE Workflow & Agents IA

### Dependencies
- **Jean:** Backend endpoints (`/convert`, `/compare/private`, `/check/public`, `/compare/commercial`, `/report`)
- **Cyriac:** Registry contract address + ABI for on-chain callback
- **Chainlink:** Confidential AI sandbox access + CRE credentials

### Tasks

#### 1. Setup CRE
- [ ] Init CRE SDK TypeScript project `[MVP]`
- [ ] Configure Chainlink CRE credentials (keys, network) `[MVP]`
- [ ] Verify Chainlink Confidential AI sandbox access `[MVP]`
- [ ] Install CRE CLI and test hello-world workflow `[MVP]`

#### 2. Workflow DAG — Structure
- [ ] Define full workflow DAG in CRE SDK (4 steps) `[MVP]`
- [ ] Step 1: `BasicPitch` call via jean endpoint (`/api/convert`) `[MVP]`
- [ ] Step 2A: `ACRCloud` call via jean endpoint (`/api/check/public`) — parallel branch `[MVP]`
- [ ] Step 2B: Private MIDI comparison call via jean endpoint (`/api/compare/private`) — parallel branch `[MVP]`
- [ ] Implement 2A ∥ 2B parallelization (Promise.all or CRE equivalent) `[MVP]`
- [ ] Step 3: Conditional — only triggers if 2A returns non-empty matches `[MVP]`
- [ ] Step 3: Commercial MIDI comparison call via jean endpoint (`/api/compare/commercial`) `[MVP]`
- [ ] Synchronization: Step 4 waits for 2B AND 3 before starting `[MVP]`
- [ ] Step 4: Final report call via jean endpoint (`/api/report`) `[MVP]`

#### 3. Logique Fail-Fast
- [ ] Step 2A: if confidence score ≥95% → halt workflow + return REJECTED `[MVP]`
- [ ] Step 2B: if similarity_score ≥75% → halt workflow + return SIMILAR `[MVP]`
- [ ] Each step: if HTTP error or timeout → halt workflow + return ERROR `[MVP]`
- [ ] No partial state written on-chain in case of halt `[MVP]`

#### 4. Chainlink Confidential AI
- [ ] Integrate calls to sensitive agents via Confidential AI API `[IMP]`
- [ ] Submit at least 1 confidential inference request in the sandbox `[IMP]`
- [ ] Verify that attestation is properly attached to agent response `[IMP]`
- [ ] Pass attestation in on-chain callback (for contract verification) `[IMP]`

#### 5. Callback On-Chain
- [ ] Implement CRE callback to Registry contract (Cyriac) `[MVP]`
- [ ] Send: verdict (`CLEAN`/`SIMILAR`/`REJECTED`), `commitmentHash`, attestation `[MVP]`
- [ ] Test callback on Ethereum Sepolia (transaction visible on Etherscan) `[MVP]`

#### 6. CRE Simulation & Deployment
- [ ] Simulate full workflow via CRE CLI `[MVP]`
- [ ] Correct simulation errors (types, dependencies) `[MVP]`
- [ ] Document simulation output for project submission `[MVP]`
- [ ] Request live deployment from Chainlink hackathon team `[IMP]`

---

## JEAN — Backend, Pipeline & Integrations

### Dependencies
- **Nohem:** Exact format of CRE requests to each endpoint
- **Cyriac:** Registry contract address
- **Marius:** Expected format of API responses (report, statuses)

### Tasks

#### 1. Setup Backend
- [ ] Init backend API (Next.js API routes or Express server) `[MVP]`
- [ ] Environment variables: ACRCloud key, Spotify client ID/secret, PostgreSQL connection string, Unlink SDK `[MVP]`
- [ ] Python env setup for `BasicPitch` (or wrapper via child_process) `[MVP]`

#### 2. Step 1 — BasicPitch (Audio → MIDI Conversion)
- [ ] Integrate `BasicPitch`: receive raw audio → return MIDI file `[MVP]`
- [ ] Endpoint `POST /api/convert` `{ audioFile }` → `{ midiSequence }` `[MVP]`
- [ ] Temporarily store MIDI for subsequent steps `[MVP]`

#### 3. Step 2A — ACRCloud (Public Fingerprint)
- [ ] Integrate ACRCloud API: send raw audio → retrieve matches `[MVP]`
- [ ] Endpoint `POST /api/check/public` `{ audioFile }` → `{ matches: [{ISRC, confidence_score}] }` `[MVP]`
- [ ] Filter: return only matches with `confidence_score` ≥50% `[MVP]`

#### 4. Step 2B — MIDI Comparison vs Private Registry
- [ ] Implement MIDI sequence comparison algo (cosine on embeddings) `[MVP]`
- [ ] Load private registry MIDI entries from PostgreSQL (AES-256 decrypt) `[MVP]`
- [ ] Endpoint `POST /api/compare/private` `{ midiSequence }` → `{ registry_matches: [{track_id, similarity_score}] }` `[MVP]`

#### 5. Step 3 — MIDI Comparison vs ACRCloud Tracks
- [ ] Integrate Spotify API: ISRC → OAuth2 access token → 30s preview URL `[MVP]`
- [ ] Download 30s audio preview from Spotify `[MVP]`
- [ ] Pass preview into `BasicPitch` → commercial MIDI `[MVP]`
- [ ] Run MIDI comparison algo: our MIDI vs commercial MIDI `[MVP]`
- [ ] Endpoint `POST /api/compare/commercial` `{ midiSequence, ISRCs[] }` → `{ commercial_deltas: [{ISRC, melodic, rhythmic, structural}] }` `[MVP]`

#### 6. Step 4 — Acoustic Extraction + Final Report
- [ ] Implement key, mode, BPM extraction from raw audio (librosa or Essentia) `[MVP]`
- [ ] Integrate Spotify Audio Analysis API: retrieve key + BPM for commercial tracks via ISRC `[IMP]`
- [ ] Aggregate `registry_matches` (2B) + `commercial_deltas` (3) into one list ranked by global score `[MVP]`
- [ ] Generate `ai_summary`: synthetic commentary on identified similarities `[IMP]`
- [ ] Endpoint `POST /api/report` `{ audioFile, midiSequence, registry_matches, commercial_deltas }` → `{ verdict, submitted_track, similar_tracks[], ai_summary }` `[MVP]`

#### 7. PostgreSQL — Private MIDI Storage
- [ ] Setup PostgreSQL container (`registry-db`) with schema for tracks and melodic intervals `[MVP]`
- [ ] Restrict DB access to the similarity service API, ensuring services perform data operations only `[MVP]`
- [ ] Endpoint `POST /api/registry` (ingestion): insert MIDI + precalculated intervals → return `registryRef` pointer `[MVP]`
- [ ] Endpoint `POST /api/compare/private` (comparison): run composition comparison using irreversible intervals `[MVP]`

#### 8. Unlink — On-chain Privacy Layer
- [ ] Install `@unlink-xyz/sdk` and configure private ethereum-sepolia pool `[IMP]`
- [ ] Derive the artist's Unlink account from a wallet signature (`fromMetaMask` / `buildDeriveSeedMessage`); seed-backed account required for `execute()` `[IMP]`
- [ ] Backend register route `/api/unlink/register` (`admin.users.register`); do NOT use the EOA as `userId` and do NOT persist the EOA↔unlink mapping `[IMP]`
- [ ] Fund the private account via `depositWithApproval()` `[IMP]`
- [ ] Call `registerTrack` via `execute()` from an Unlink `ExecutionAccount` (`msg.sender` is the pooled `ExecutionAccount`; the **owner identity is passed explicitly as `ownerKey`**, never inferred from `msg.sender`) `[IMP]`
  - *Signature:* `registerTrack(nullifier, commitmentHash, ownerKey, registryRef)`
- [ ] Call `revealTrack` via `execute()`; ownership proven by **signature** against `ownerKey`, not `msg.sender` `[IMP]`
  - *Signature:* `revealTrack(trackId, fullProfileHash, signature)`
- [ ] (Optional, later) Private license settlement between two parties via Unlink `transfer`/`execute` `[BONUS]`
- [ ] Verify that transaction amounts/parties are invisible on-chain from the outside `[IMP]`

> Unlink is on-chain account privacy only. It does **not** do x402, file/SoundCloud uploads, or audio transit. SoundCloud publishing is the separate `soundcloud-service`.

#### 9. Documentation & Repo
- [ ] `README.md`: describe all endpoints, request/response formats `[MVP]`
- [ ] Document Unlink integration: what is now private vs before `[IMP]`
- [ ] Document PostgreSQL storage configuration, schema, and API access boundaries `[IMP]`
