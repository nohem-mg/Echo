# THE Echo PROTOCOL - ETH Global New York 2026

## Open-Source Music Prior-Art Registry
**Technical Project Documentation — v2**  
*June 2026*  

---
*CNM Agency — Confidential / Internal Documentation*  
*World ID | Chainlink | CRE | Unlink*

---

## 1. Executive Summary

The Echo Protocol is an on-chain music prior-art registry designed for independent artists who need a timestamped, verifiable, and confidential proof of creation without ever exposing their unreleased music.

**Core Idea:** With the rise of AI-generated music and landmark lawsuits (Suno, Udio), artists need a trustless, verifiable, and private way to state, "I created this first." The Echo Protocol makes this possible by combining multi-agent AI fingerprinting, Trusted Execution Environments (TEEs), and on-chain timestamping in a 5-phase parallelised agentic pipeline.

| Problem | Solution | Target Audience | Prize Goal |
| :--- | :--- | :--- | :--- |
| No trustless, private, and verifiable way to claim musical prior-art before releasing a track. | A 5-phase parallelised agentic pipeline: parallel Shazam check + acoustic analysis, parallel private registry comparison + commercial comparison, final synthesis with a list of similar tracks, and on-chain commitment. | Indie artists, labels, music IP lawyers, and AI platforms requiring provable IP traceability. | $20,500 split across World, Chainlink, and Unlink prize tracks. |

## 2. Problem Statement

The music industry is facing an intellectual property crisis driven by two converging forces:
* **AI-generated music (Suno, Udio, Stable Audio)** can produce melodies, chord progressions, and timbres at scale that are virtually identical to human compositions, making it almost impossible to prove who created a piece first.
* **No neutral prior-art registry exists** for independent musicians. Traditional copyright registration (SACEM, US Copyright Office, etc.) is slow, centralised, and requires public disclosure — a dealbreaker for an unreleased track.
* **Streaming platforms and social networks** offer zero IP protection. Uploading a track to SoundCloud or YouTube does not constitute legally enforceable proof of prior-art.
* **Confidentiality is critical:** an artist cannot publicly disclose a track before its commercial release without destroying its market value.

### 2.1 The Gap

What artists need is a system that satisfies four properties simultaneously:
* **Trustless:** no intermediary can forge, alter, or delete the registry entry.
* **Verifiable:** any third party (judge, label, lawyer) can independently verify the timestamp and fingerprint.
* **Confidential:** the actual audio remains private until the artist decides to reveal it.
* **Sybil-resistant:** one human equals one proof of creation, preventing spamming of the registry by bots or competitor labels.

No existing solution — whether the US Copyright Office, SACEM, or any blockchain project — satisfies all four properties simultaneously. The Echo Protocol does.

## 3. Agentic Pipeline: Sequence & Parallelisation

The core of The Echo Protocol is a 4-step DAG (Directed Acyclic Graph) pipeline designed to maximize agentic parallelisation while ensuring a strict fail-fast design. Steps 2A and 2B run in parallel; Step 3 starts as soon as 2A is finished without waiting for 2B; Step 4 waits until both 2B and 3 are complete.

### 3.1 DAG Overview

* **STEP 1: Audio → MIDI Conversion** (Sequential — Prerequisite for all subsequent steps)
  * *Tool:* BasicPitch (Spotify Research). Converts raw audio into a MIDI sequence. This is a conversion tool only, not an analysis agent.
* **STEP 2: Double Comparison** (PARALLEL: 2A ∥ 2B)
  * *2A:* ACRCloud compares the acoustic fingerprint (spectro-temporal peaks) of the submitted audio against its public database of millions of commercial tracks. Returns the ISRCs of acoustically similar songs with a confidence score. [≥95% → STOP plagiarism]
  * *2B:* The MIDI sequence comparison algorithm compares the MIDI (Step 1) against our private registry database (tracks stored in MIDI format). Returns similar tracks with a compositional similarity score. [≥75% → STOP SIMILAR]
* **STEP 3: MIDI vs. ACRCloud Results Comparison** (Sequential, starts as soon as 2A is finished, does not wait for 2B)
  * Using the ISRCs returned by ACRCloud, the system retrieves a 30s audio preview of each similar track (via the Spotify API) and converts it to MIDI using BasicPitch. The MIDI sequence comparison algorithm then runs between our MIDI (Step 1) and these commercial MIDIs — detecting compositional similarity beyond acoustic resemblance.
* **STEP 4: Acoustic Feature Extraction + Final Report** (Sequential, waits for both 2B and 3)
  * Extracts the key, BPM, and acoustic fingerprint from the raw audio (not the MIDI — these features must be extracted from the audio signal). Does the same for all similar tracks found in 2B + 3 (using Spotify Audio Analysis for commercial tracks). Generates the final ranked report.

### 3.2 Dependency Diagram (DAG)

```
Legend: ∥ = parallelisation │ → = sequential dependency │ [STOP] = fail-fast

STEP 1: BasicPitch (Audio → MIDI Conversion) ─── [STOP on failure]
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
  STEP 2A: ACRCloud           STEP 2B: MIDI Comparison Algo
  Fingerprint vs. Public DB   MIDI vs. Private Registry DB
  → ISRC + confidence score   → similar tracks + score %
  [≥95% → STOP plagiarism]    [≥75% → STOP SIMILAR]
         │                           │
         ▼                           │
  STEP 3: Spotify API / ISRC         │
  → Preview → MIDI                   │
  → Algo MIDI vs. Commercial         │
         │                           │
         └─────────────┬─────────────┘
                       ▼
  STEP 4: Key + BPM + fingerprint extraction (raw audio) → Final Ranked Report
```

### 3.3 Detailed Step-by-Step

#### Step 1 — Audio → MIDI Conversion (Sequential)

* **Component:** BasicPitch (Spotify Research)
* **Action:** Receives raw audio (WAV/MP3). Converts it into a MIDI note sequence. This is a transformation tool only and performs no musical analysis. The actual comparison of MIDI sequences is performed by a separate algorithm (Steps 2B and 3).
* **Output:** `midi_sequence` (file)
* **Blocker:** Prerequisite for both 2A and 2B.

#### Step 2 — Double Parallel Comparison: 2A ∥ 2B

##### 2A: ACRCloud (Public Database)
* **Mechanism:** ACRCloud extracts an acoustic fingerprint from the submitted audio (spectro-temporal landmarks). This fingerprint is compared via fast lookup against pre-calculated fingerprints of millions of commercial tracks in its public database. Similarity is measured by matching time-frequency landmarks.
* **What it detects:** Acoustic / timbral similarity (same recording, same production style, sample, copy).
* **What it does NOT detect:** Compositional similarity between two different recordings — which is why Step 3 is required.
* **Actions:**
  1. Extract fingerprint from the submitted audio.
  2. Lookup in the public database.
  3. Return matches with confidence scores and ISRCs.
* **Output / Fail-Fast Condition:** `matches[]` → `{ ISRC, confidence_score }`. Confidence score = % of matching landmarks.
  * `≥95%` → Immediate STOP (clear copy)
  * `50–94%` → Proceed to Step 3
  * `< 50%` → Ignore Step 3 for this candidate

##### 2B: MIDI Comparison Algo (Private Database)
* **Mechanism:** MIDI sequence comparison algorithm (cosine similarity on MIDI embeddings). Compares the MIDI sequence produced by BasicPitch note-by-note against all entries in our private registry (stored in PostgreSQL).
* **What it detects:** Actual compositional similarity (same melody, same harmony, same structure — regardless of production style). Returns a true musical similarity percentage. Note: This is a distinct algorithm from BasicPitch. BasicPitch converts; this algorithm compares.
* **Output / Fail-Fast Condition:** `registry_matches[]` → `{ track_id, timestamp, similarity_score }`. Similarity score = true musical similarity %.
  * `≥75%` → STOP (SIMILAR)
  * `< 75%` → Proceed to Step 4
* **Implementation Note:** 2A receives raw audio. 2B receives the MIDI from Step 1. They have no mutual dependencies and are triggered concurrently by the CRE.

#### Step 3 — MIDI vs. ACRCloud Results Comparison (Sequential after 2A)

* **Tool:** Spotify API + BasicPitch + MIDI Comparison Algo
* **Mechanism & Actions:**
  * *Purpose:* ACRCloud detects acoustic similarity but not compositional similarity. The tracks it returns are the strongest candidates for compositional plagiarism. We must therefore compare our MIDI sequence against theirs.
  * 1. Query the Spotify API using the ISRC returned by 2A to retrieve a 30-second audio preview.
  * 2. Pass these preview files to BasicPitch to extract their MIDI sequences.
  * 3. Run the MIDI comparison algorithm between our MIDI sequence (Step 1) and each commercial MIDI. Returns a true compositional similarity percentage.
* **Output:** `commercial_deltas[]` → `{ ISRC, melodic_similarity, rhythmic_similarity, structural_similarity }` (all as true musical similarity %). Blocks Step 4.
* **Implementation Note:** Step 3 starts as soon as 2A is complete, without waiting for 2B. Step 4 waits for both 2B and 3 to finish.

#### Step 4 — Acoustic Feature Extraction + Final Report (waits for 2B + 3)

* **Tool:** Acoustic Analysis Algo + Spotify Audio Analysis (for commercial tracks)
* **Actions:**
  * *Inputs:* raw audio (required for feature extraction), `midi_sequence` (melodic context), `registry_matches[]` from 2B, `commercial_deltas[]` from 3.
  * *Why raw audio is used instead of MIDI:* Key, mode, and BPM must be extracted from the audio signal. The MIDI format does not carry these acoustic properties.
  * 1. Extract key, mode, BPM, and acoustic fingerprint of the submitted track (from the raw audio).
  * 2. Extract the same features for similar tracks found in 2B + 3. For commercial tracks: fetch via Spotify Audio Analysis (pre-calculated, saving computation time).
  * 3. Aggregate all results into a final report with a ranked list of similar tracks.
* **Output:** `final_report` → `{ verdict: CLEAN | SIMILAR, submitted_track: { key, mode, BPM, fingerprint }, similar_tracks: [ { rank, title, source, score, melody, rhythm, structure, key, BPM } ], ai_summary: string }`.
  * `SIMILAR` → Report returned to the artist
  * `CLEAN` → Trigger on-chain commitment/registration

### 3.4 Final Comparison Report Format

The report produced by Step 4 is rendered in the artist interface as an interactive table:

| Rank | Title — Artist | Global Score | Melody | Rhythm | Structure | Key / BPM | Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Blinding Lights — The Weeknd | 68% | 72% | 81% | 55% | A min / 171 | ACRCloud |
| 2 | @artist_xyz — [SEALED] | 61% | 65% | 58% | 62% | G maj / 124 | Private Registry |
| 3 | As It Was — Harry Styles | 44% | 38% | 61% | 40% | A min / 174 | ACRCloud |

* **Verdict Rule:** Global score of the top match < 75% → verdict CLEAN, SEAL procedure is triggered. Score ≥75% → verdict SIMILAR, report is displayed to the artist, no on-chain write occurs.

### 3.5 SoundCloud Integration via Unlink

After a successful SEALED registration, the artist can optionally publish their track to SoundCloud using the SoundCloud API. This workflow is entirely routed through Unlink: private audio transit, untraceable payment, and an on-chain inobservable link between the Echo Protocol registration and the SoundCloud publication.

### 3.6 Clearance API (Monetisation)

External applications can query the registry via the Clearance API. Each query requires a x402 micro-payment:
* IP verification before upload for streaming platforms.
* Dataset screening for AI companies.
* Certified reports for IP attorneys.

---

## 4. Tools & Agents Summary

The pipeline utilizes one conversion tool and three comparison/analysis agents. The distinction between a conversion tool and a comparison algorithm is critical: **BasicPitch converts, it does not analyze.**

| Step | Tool / Agent | Type | Role | Source Compared | Output |
| :--- | :---: | :---: | :--- | :--- | :--- |
| 1 | BasicPitch | Conversion | Converts raw audio to MIDI sequence. A transformation tool only, no analysis. | — | `midi_sequence` |
| 2A | ACRCloud | Fingerprint lookup | Compares acoustic fingerprint (spectro-temporal peaks) against public database. Detects acoustic/timbral similarity. | ACRCloud Public DB | ISRC + confidence score |
| 2B | MIDI Comparison Algo | Compositional similarity | Cosine similarity comparison on MIDI embeddings between submitted sequence and private registry entries. Detects true musical similarity. | Private Registry (MIDI, PostgreSQL) | `similarity_score` (%) |
| 3 | Spotify API + BasicPitch + MIDI Algo | Compositional similarity | ISRC (ACRCloud) → Spotify 30s preview → BasicPitch → commercial MIDI. Compares submitted MIDI vs. commercial MIDIs. | ACRCloud tracks (via Spotify) | `melodic, rhythmic, structural similarity (%)` |
| 4 | Acoustic Analysis Algo + Spotify Audio Analysis | Extraction + Synthèse | Extracts key, BPM, and fingerprint from raw audio. Fetches Spotify Audio Analysis for commercial tracks (pre-calculated). Generates final ranked report. | Raw audio + results from 2B + 3 | Final report `CLEAN \| SIMILAR` |

### 4.1 BasicPitch vs. MIDI Comparison Algo

| Feature | BasicPitch | MIDI Comparison Algo |
| :--- | :--- | :--- |
| **Role** | Convert audio to MIDI notes | Compare two MIDI sequences |
| **Input** | Audio file (WAV/MP3) | Two MIDI files |
| **Output** | MIDI sequence (notes, durations, velocities) | Similarity score (0–100%) |
| **Used in** | Step 1 (submitted track) + Step 3 (commercial previews) | Step 2B (vs. private registry) + Step 3 (vs. commercial) |

### 4.2 Confidential AI — Why TEEs?

Chainlink Confidential AI provides hardware isolation (Intel TDX) for agents operating on sensitive data. This guarantees:
* **Input Confidentiality:** raw audio and MIDI sequences never leave the enclave.
* **Output Integrity:** scores and the final report carry a cryptographically verifiable on-chain attestation.
* **Pre-release Security:** unreleased tracks can be analyzed with zero risk of audio leakage.

---

## 5. Technical Stack

| Layer | Technology | Role in The Echo Protocol |
| :--- | :--- | :--- |
| **Human Identity** | World ID + AgentKit | Proves each artist is a unique, verified human. AgentKit issues *Human-Backed Agent* credentials required to enter the pipeline and manage the free-trial system. |
| **Orchestration** | Chainlink CRE | DAG 5-phase workflow engine. Manages parallelisation (A ∥ B and C ∥ D), inter-phase synchronisation, and the final on-chain verdict callback. |
| **Confidential AI** | Chainlink Confidential AI | Executes agents A, B, C, and D inside TEE enclaves. Generates cryptographically verifiable on-chain attestations. |
| **Commercial Detection** | ACRCloud | Agent A: Shazam-style commercial check in Phase 1. Acoustic fingerprint comparison against the global catalogue of released tracks. |
| **MIDI Conversion** | BasicPitch (Spotify) | Agent B: audio → MIDI conversion + key, BPM, fingerprint, chord, and structural extraction. |
| **Privacy Layer** | Unlink SDK | Routes all agent payments (x402) and SoundCloud transmission through private balances, preventing transaction graph analysis. |
| **Storage** | PostgreSQL | Registry tracks database (service `registry-db` of docker-compose). Stores full MIDI and skyline interval profiles. Accessible only via the `midi-similarity-service` API. |
| **Blockchain** | Ethereum Sepolia | Hosts the `Registry` smart contract. |
| **Wallet / Auth** | MetaMask / World App (wagmi) | Transaction signing for artists. World App serves as the primary interface for World ID. |
| **Payments** | x402 Protocol | Machine-to-machine HTTP micro-payments for the 5 agents and Clearance API queries. All x402 flows route through Unlink. |

### 5.1 PostgreSQL Storage Architecture

### 5.1 PostgreSQL Storage Architecture

The private registry is stored in a PostgreSQL database (`registry-db`), replacing Sui/Walrus. This serves as the confidential store for Step 2B composition comparison.

* **Registry Schema:** Stores the full MIDI sequence (source of truth for potential future re-indexing) along with precalculated melodic intervals used for similarity scoring.
* **Access Rules:** Schema initialization is handled by the database container itself. Services perform data operations (SELECT/INSERT) only.
* **Network Isolation:** The database is isolated and only accessible via the similarity service API (`POST /api/registry` and `POST /api/compare/private`). The CRE gateway does not communicate directly with the database.
* **Confidentiality:** Audio files are never stored. Only irreversible compositional fingerprints serve for similarity scoring, with the MIDI sequences securely enclosed in the database.
* **On-chain reference:** The smart contract stores only a `registryRef = keccak256(track_id)` as an opaque pointer to the database entry.

---

## 6. Prize Strategy

The Echo Protocol targets a total of **$20,500** across five prize tracks from three sponsors.

### 6.1 World — Track A (AgentKit) | $7,500
* **Prizes:** $3,500 (1st) / $2,500 (2nd) / $1,500 (3rd)
* **Requirement:** Significant use of AgentKit + human-verified free-trial system + operational Human-Backed Agents.
* **Our Implementation:** AgentKit issues *Human-Backed Agent* credentials in Phase 0. The five AI agents inherit this credential, ensuring only human-initiated registrations go through.
* **Trial System:** The first 3 registrations per World ID are free. After the trial, x402 micro-payments are enabled.

### 6.2 World — Track B (World ID) | $2,500
* **Prizes:** $1,500 (1st) / $1,000 (2nd)
* **Requirement:** The product must not function without World ID + on-chain verified proof.
* **Why We Qualify:** Without World ID, scripts could spam the registry with thousands of fake claims. World ID imposes one-human-one-registration. Verified on-chain via the World Router contract on Base Sepolia.

### 6.3 Chainlink — Best CRE Workflow | $6,000
* **Prizes:** Up to 3 teams x $2,000
* **Requirement:** CRE workflow as orchestration layer + >= 1 blockchain + API/LLM/agent + successful simulation.
* **Our Implementation:** The CRE is the central orchestrator of the 5-phase DAG. It manages A ∥ B parallelization (Phase 1), inter-phase synchronization, C ∥ D parallelization (Phase 2), and the final on-chain write. Blockchain + 5 API/AI agent calls in a single workflow. Simulation via CRE CLI + live deployment requested from the Chainlink team during the hackathon.

### 6.4 Chainlink — Confidential AI Attester | $4,000
* **Prizes:** Up to 2 teams x $2,000
* **Requirement:** Use Chainlink Confidential AI APIs, submit >= 1 confidential request, handle sensitive inputs.
* **Our Implementation:** Four agents (A, B, C, D) submit confidential inference requests. Sensitive inputs include: MIDI of unreleased tracks, full profile, private registry comparison, and commercial comparison. Attestations are verified by the Registry contract.

### 6.5 Unlink — Best Integration in an OSS App | $2,500
* **Prizes:** $2,500
* **Requirement:** Integrate `@unlink-xyz/sdk` in a real open-source app, route existing flows via Unlink, functional demo + public repo.
* **Our Implementation:** Two integration points:
  1. x402 payment pipeline for the 5 agents (all machine-to-machine flows go through Unlink private balances).
  2. OSS SoundCloud API client (audio upload + payments routed through Unlink, keeping distribution untraceable from the on-chain registry).

### 6.6 Prize Summary

| Prize Track                          | Max Amount    | Target Placement                              |
| :-------------------------------------| :-------------| :----------------------------------------------|
| World — Track A (AgentKit)           | $7,500        | 1st Place ($3,500)                            |
| World — Track B (World ID)           | $2,500        | 1st Place ($1,500)                            |
| Chainlink — Best CRE Workflow        | $6,000        | 1 slot at $2,000                              |
| Chainlink — Confidential AI Attester | $4,000        | 1 slot at $2,000                              |
| Unlink — Best OSS Integration        | $2,500        | 1st Place ($2,500)                            |
| **TOTAL TARGET**                     | **$20,500**   | *Conservative estimate (minimum targeted tiers)* |

---

## 7. Smart Contract Architecture

### 7.1 Registry Contract (Base Sepolia)
The Registry contract is the single source of truth for all prior-art claims. It stores:
* `commitmentHash`: `keccak256(fingerprint + profile JSON)` — sealed at registration.
* `worldNullifier`: World ID nullifier hash ensuring one registration per human per track.
* `timestamp`: `block.timestamp` at registration — the legally significant prior-art date.
* `status`: `SEALED | REVEALED | SIMILAR | REJECTED`.
* `registryRef`: references the database entry pointer (`keccak256(track_id)`).

### 7.2 World Router Integration
The Registry contract queries the World Router to validate the World ID proof before any write operation. If the proof is invalid, `registerTrack()` reverts.

### 7.3 CRE → Contract Write Flow
Chainlink CRE acts as a trusted off-chain executor. Once the 5-phase DAG completes successfully, the CRE's on-chain callback writes the commitment and status to the Registry contract in a single atomic transaction. The callback includes the Confidential AI attestation, verified by the contract before acceptance.

### 7.4 SEALED → REVEALED Lifecycle
* **SEALED:** hash on-chain, timestamp locked, audio and profile remain confidential. Ready for legal dispute resolution.
* **REVEALED:** the artist triggers a reveal transaction upon commercial release. The full profile is published, linking the SEALED hash to the actual audio.

---

## 8. Competitive Differentiation

| Property | US Copyright Office | SACEM / CMOs | Simple NFT Timestamp | The Echo Protocol |
| :--- | :---: | :---: | :---: | :---: |
| **Trustless** | ✗ | ✗ | ~ | ✓ |
| **Confidential (Pre-release)** | ✗ | ✗ | ✗ | ✓ |
| **Sybil Resistant** | ~ | ~ | ✗ | ✓ |
| **Multi-Agent AI Similarity Verification** | ✗ | ✗ | ✗ | ✓ |
| **Registry + Commercial Comparison** | ✗ | ✗ | ✗ | ✓ |
| **Final Report with Similar Track List** | ✗ | ✗ | ✗ | ✓ |
| **Instantaneous (< 75s)** | ✗ | ✗ | ✓ | ✓ |
| **Decentralised Storage** | ✗ | ✗ | ~ | ✓ |

---

## 9. Hackathon Deliverables & Roadmap

### 9.1 Deliverables for ETH Global New York
1. **World ID Integration** — World Router contract on Base Sepolia, AgentKit credential issuance, free-trial mechanics (3 free registrations per human).
2. **5-Phase DAG CRE Workflow** — Parallelisation A ∥ B (Phase 1) and C ∥ D (Phase 2). Simulated via CRE CLI, live deployment requested from Chainlink.
3. **4 Chainlink Confidential AI Agents** — Agents A, B, C, D in TEE. Attestations verified by the Registry contract.
4. **Unlink SDK Integration** — x402 payments for the 5 agents + SoundCloud uploads routed via Unlink private balances.
5. **PostgreSQL Storage**
6. **Final Comparison Report** — Agent E: ranked list of N similar tracks with multidimensional scores and AI commentary.
7. **Front-end Demo** — Next.js / wagmi interface: track upload, World App verification, SEALED certificate generation + comparison report display.
8. **Public Repository & README** — Complete integration documentation, upstream OSS projects, and details on private/public data boundaries.
