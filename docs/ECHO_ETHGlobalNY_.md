# THE Echo PROTOCOL - ETH Global New York 2026

## Open-Source Music Prior-Art Registry
**Technical Project Documentation — v3**  
*June 2026*  

---
*ECHO Team — Confidential / Internal Documentation*  
*World ID | Chainlink | CRE | Unlink*

---

## 1. Executive Summary

The Echo Protocol is an on-chain music prior-art registry designed for independent artists who need a timestamped, verifiable, and confidential proof of creation without ever exposing their unreleased music.

**Core Idea:** With the rise of AI-generated music and landmark lawsuits (Suno, Udio), artists need a trustless, verifiable, and private way to state, "I created this first." The Echo Protocol makes this possible by combining multi-agent AI fingerprinting, confidential analysis, and on-chain timestamping in a 4-step parallelised agentic DAG.

| Problem                                                                                        | Solution                                                                                                                                                                                                                  | Target Audience                                                                               | Prize Goal                                                      |
| :-----------------------------------------------------------------------------------------------| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------| :----------------------------------------------------------------------------------------------| :----------------------------------------------------------------|
| No trustless, private, and verifiable way to claim musical prior-art before releasing a track. | A 4-step parallelised agentic DAG: audio→MIDI conversion, parallel public (ACRCloud) + private-registry comparison, conditional commercial MIDI comparison, final synthesis with a ranked list of similar tracks, then on-chain commitment. | Indie artists, labels, music IP lawyers, and AI platforms requiring provable IP traceability. | $20,500 split across World, Chainlink, and Unlink prize tracks. |

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
* **STEP 3: Commercial Match Scoring** (Sequential, starts as soon as 2A is finished, does not wait for 2B)
  * For each ACRCloud match scoring ≥50%, score the flagged commercial track (identified by ISRC) to produce melodic / rhythmic / structural deltas. This refines ACRCloud's single confidence score into a per-dimension breakdown. *Note: the MIDI comparison algorithm runs only against the private registry (2B) — commercial audio is not converted to MIDI.*
* **STEP 4: Acoustic Feature Extraction + Final Report** (Sequential, waits for both 2B and 3)
  * Extracts the key, BPM, and acoustic fingerprint from the raw audio (not the MIDI — these features must be extracted from the audio signal), aggregates the 2B and 3 results, and generates the final ranked report.

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
  STEP 3: Score ACRCloud             │
  commercial matches (by ISRC)       │
  → melodic/rhythmic/structural      │
         │                           │
         └─────────────┬─────────────┘
                       ▼
  STEP 4: Key + BPM + fingerprint extraction (raw audio) → Final Ranked Report
```

### 3.3 Detailed Step-by-Step

#### Step 1 — Audio → MIDI Conversion (Sequential)

* **Component:** BasicPitch (Spotify Research)
* **Action:** Receives raw audio (WAV/MP3). Converts it into a MIDI note sequence. This is a transformation tool only and performs no musical analysis. The actual comparison of MIDI sequences is performed by a separate algorithm (Step 2B).
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
* **Output / Fail-Fast Condition:** `matches[]` → `{ ISRC, confidence_score }`. Confidence score = % of matching landmarks. (Thresholds defined in `cre/echo/types.ts`.)
  * `≥95%` → Immediate STOP, verdict REJECTED (clear acoustic copy)
  * `≥85%` → Immediate STOP, verdict REJECTED (cover / humming match)
  * `50–84%` → Proceed to Step 3
  * `< 50%` → Ignore Step 3 for this candidate

##### 2B: MIDI Comparison Algo (Private Database)
* **Mechanism:** MIDI sequence comparison algorithm (cosine similarity on MIDI embeddings). Compares the MIDI sequence produced by BasicPitch note-by-note against all entries in our private registry (stored in PostgreSQL).
* **What it detects:** Actual compositional similarity (same melody, same harmony, same structure — regardless of production style). Returns a true musical similarity percentage. Note: This is a distinct algorithm from BasicPitch. BasicPitch converts; this algorithm compares.
* **Output / Fail-Fast Condition:** `registry_matches[]` → `{ track_id, timestamp, similarity_score }`. Similarity score = true musical similarity %.
  * `≥75%` → STOP (SIMILAR)
  * `< 75%` → Proceed to Step 4
* **Implementation Note:** 2A receives raw audio. 2B receives the MIDI from Step 1. They have no mutual dependencies and are triggered concurrently by the CRE.

#### Step 3 — Commercial Match Scoring (Sequential after 2A)

* **Tool:** Commercial scoring service (keyed by ACRCloud ISRC)
* **Mechanism & Actions:**
  * *Purpose:* ACRCloud returns a single acoustic confidence score. The matches it flags (≥50%) are the strongest commercial candidates, so we break their similarity down per dimension to enrich the final report.
  * 1. Take the ISRCs returned by 2A that scored ≥50%.
  * 2. Score each flagged commercial track to produce a melodic / rhythmic / structural breakdown.
  * *Note:* the MIDI comparison algorithm is **not** used here — it runs only against the private registry (2B). Commercial audio is never converted to MIDI.
* **Output:** `commercial_deltas[]` → `{ ISRC, melodic_similarity, rhythmic_similarity, structural_similarity }`. Blocks Step 4.
* **Implementation Note:** Step 3 starts as soon as 2A is complete, without waiting for 2B. Step 4 waits for both 2B and 3 to finish.

#### Step 4 — Acoustic Feature Extraction + Final Report (waits for 2B + 3)

* **Tool:** Acoustic Analysis Algo (`report-service`)
* **Actions:**
  * *Inputs:* raw audio (required for feature extraction), `midi_sequence` (melodic context), `registry_matches[]` from 2B, `commercial_deltas[]` from 3.
  * *Why raw audio is used instead of MIDI:* Key, mode, and BPM must be extracted from the audio signal. The MIDI format does not carry these acoustic properties.
  * 1. Extract key, mode, BPM, and acoustic fingerprint of the submitted track (from the raw audio).
  * 2. Aggregate the 2B and 3 results into a ranked list of similar tracks.
  * 3. Produce the final report with the verdict.
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

### 3.5 SoundCloud Integration

After a successful SEALED registration, the artist can optionally publish their track to SoundCloud. This is handled by the dedicated `soundcloud-service`: the audio is streamed directly to the SoundCloud API and never stored at rest. (Note: this path does not use Unlink — Unlink is only the private license-settlement layer, see §3.7.)

### 3.6 Clearance API (Monetisation)

External applications can query the registry via the Clearance API. Each query requires a micro-payment:
* IP verification before upload for streaming platforms.
* Dataset screening for AI companies.
* Certified reports for IP attorneys.

### 3.7 Unlink — On-chain Privacy Layer

Unlink provides private blockchain account operations (it hides balances, amounts, and transaction history; primitives: `deposit`, `transfer`, `withdraw`, `execute`). Echo uses it for **one thing only — private license settlement in the `LicenseEscrow` contract** — never for registration/sealing, file uploads, audio transit, or HTTP payments:

* **Private license settlement** — buyer and seller interact with `LicenseEscrow` through pooled `ExecutionAccount`s via Unlink `execute()`. The contract sees the `ExecutionAccount` as `msg.sender`, so the parties and the amount stay unlinkable (the frontend batches `approve` + `purchase` into a single `execute()`).

---

## 4. Tools & Agents Summary

The pipeline utilizes one conversion tool and three comparison/analysis agents. The distinction between a conversion tool and a comparison algorithm is critical: **BasicPitch converts, it does not analyze.**

| Step | Tool / Agent | Type | Role | Source Compared | Output |
| :--- | :---: | :---: | :--- | :--- | :--- |
| 1 | BasicPitch | Conversion | Converts raw audio to MIDI sequence. A transformation tool only, no analysis. | — | `midi_sequence` |
| 2A | ACRCloud | Fingerprint lookup | Compares acoustic fingerprint (spectro-temporal peaks) against public database. Detects acoustic/timbral similarity. | ACRCloud Public DB | ISRC + confidence score |
| 2B | MIDI Comparison Algo | Compositional similarity | Cosine similarity comparison on MIDI embeddings between submitted sequence and private registry entries. Detects true musical similarity. | Private Registry (MIDI, PostgreSQL) | `similarity_score` (%) |
| 3 | Commercial scoring service | Per-dimension scoring | Scores ACRCloud's flagged commercial matches (≥50%, by ISRC) into melodic/rhythmic/structural deltas. Does not use MIDI. | ACRCloud tracks (by ISRC) | `melodic, rhythmic, structural (%)` |
| 4 | Acoustic Analysis Algo | Extraction + synthesis | Extracts key, BPM, and fingerprint from raw audio. Aggregates 2B + 3 into the final ranked report. | Raw audio + results from 2B + 3 | Final report `CLEAN \| SIMILAR` |

### 4.1 BasicPitch vs. MIDI Comparison Algo

| Feature | BasicPitch | MIDI Comparison Algo |
| :--- | :--- | :--- |
| **Role** | Convert audio to MIDI notes | Compare two MIDI sequences |
| **Input** | Audio file (WAV/MP3) | Two MIDI files |
| **Output** | MIDI sequence (notes, durations, velocities) | Similarity score (0–100%) |
| **Used in** | Step 1 (submitted track only) | Step 2B (vs. private registry only) |

### 4.2 Confidential AI

Chainlink Confidential AI isolates the agents operating on sensitive data — the pipeline routes their backend calls through `ConfidentialHTTPClient` and verifies a per-step attestation. This guarantees:
* **Input Confidentiality:** raw audio and MIDI sequences never leave the confidential environment.
* **Output Integrity:** scores and the final report carry a cryptographically verifiable on-chain attestation.
* **Pre-release Security:** unreleased tracks can be analyzed with zero risk of audio leakage.

---

## 5. Technical Stack

| Layer                    | Technology                   | Role in The Echo Protocol                                                                                                                                                  |
| :-------------------------| :-----------------------------| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Human Identity**       | World ID                     | Proves each artist is a unique, verified human. A verified human is required to enter the pipeline.                                       |
| **Orchestration**        | Chainlink CRE                | 4-step DAG workflow engine. Manages parallelisation (Step 2A ∥ 2B), the conditional Step 3, inter-step synchronisation, and the final on-chain verdict callback.           |
| **Confidential AI**      | Chainlink Confidential AI    | Runs the analysis steps (ACRCloud check, MIDI comparisons, report synthesis) in a confidential environment. Generates cryptographically verifiable on-chain attestations.  |
| **Commercial Detection** | ACRCloud                     | Step 2A: Shazam-style commercial check. Acoustic fingerprint comparison against the global catalogue of released tracks.                                                   |
| **MIDI Conversion**      | BasicPitch (Spotify)         | Step 1: audio → MIDI conversion. Acoustic feature extraction (key, BPM, fingerprint) happens separately in Step 4 from the raw audio.                                      |
| **Privacy Layer**        | Unlink SDK                   | Private license settlement on `LicenseEscrow` via pooled `ExecutionAccount`s (frontend batches `approve`+`purchase` in one `execute()`). Hides the buyer, seller, and amount. Used only for the licensing layer — not for registration/sealing, uploads, or HTTP payments. |
| **Storage**              | PostgreSQL                   | Private registry database (service `registry-db`, db `echo`). Stores full MIDI and melodic interval profiles. Accessible only via the `midi-similarity-service` / `registry-service` APIs. |
| **Blockchain**           | Ethereum Sepolia             | Hosts the `Registry` and `LicenseEscrow` smart contracts.                                                                                                                  |
| **Wallet / Auth**        | MetaMask / World App (wagmi) | Transaction signing for artists. World App serves as the primary interface for World ID.                                                                                   |
| **Payments**             | x402 Protocol                | Machine-to-machine HTTP micro-payments for Clearance API queries. Separate from Unlink (Unlink is on-chain account privacy, not an HTTP-payment transport).                |

### 5.1 PostgreSQL Storage Architecture

The private registry is stored in a PostgreSQL database (`registry-db`, database `echo`). This serves as the confidential store for Step 2B composition comparison.

* **Registry Schema:** Stores the full MIDI sequence (source of truth for potential future re-indexing) along with precalculated melodic intervals used for similarity scoring.
* **Access Rules:** Schema initialization is handled by the database container itself. Services perform data operations (SELECT/INSERT) only.
* **Network Isolation:** The database is isolated and only accessible via the similarity service API (`POST /api/registry` and `POST /api/compare/private`). The CRE gateway does not communicate directly with the database.
* **Confidentiality:** Audio files are never stored. Only irreversible compositional fingerprints serve for similarity scoring, with the MIDI sequences securely enclosed in the database.
* **On-chain reference:** The smart contract stores only a `registryRef = keccak256(track_id)` as an opaque pointer to the database entry.


## 6. Smart Contract Architecture

Two contracts are deployed on Ethereum Sepolia: `Registry` (prior-art claims) and `LicenseEscrow` (private OTC licensing of sealed tracks).

### 6.1 Registry Contract
The Registry contract is the single source of truth for all prior-art claims. Each `Entry` stores:
* `commitmentHash`: `keccak256(fingerprint + profile JSON)` — sealed at registration.
* `timestamp`: `block.timestamp` at registration — the legally significant prior-art date (`0` = no entry).
* `status`: `SEALED | REVEALED`.
* `registryRef`: opaque pointer to the off-chain database entry (`keccak256(track_id)`).
* `owner`: an ephemeral owner-key address (pseudonymous, unlinkable to the artist's real wallet). Ownership is later proven by an EIP-191 signature, which lets reveal/license calls be submitted by any relayer (the artist's wallet never needs to appear).

### 6.2 World ID — Enforced Upstream, Not On-Chain
World ID humanity/uniqueness is enforced **upstream at the agent gate**: only a verified human can trigger a seal. The World ID nullifier is deliberately **not** stored on-chain — it is the same per human, so persisting it would make an artist's tracks publicly correlatable while buying no on-chain enforcement. The contract therefore has no World Router dependency.

### 6.3 CRE → Contract Write Flow
Chainlink CRE acts as a trusted off-chain executor. Once the 4-step DAG completes with a CLEAN verdict, the CRE's on-chain callback (`onReport`) creates and seals the entry in a single atomic transaction. The callback includes the Confidential AI attestation, verified by the contract before acceptance. SIMILAR / REJECTED / ERROR verdicts halt off-chain and write no on-chain state.

### 6.4 SEALED → REVEALED Lifecycle
* **SEALED:** hash on-chain, timestamp locked, audio and profile remain confidential. Ready for legal dispute resolution.
* **REVEALED:** the artist triggers a reveal transaction upon commercial release. The full profile is published, linking the SEALED hash to the actual audio.

### 6.5 LicenseEscrow Contract
`LicenseEscrow` lets a track owner sell a license to a sealed track through a private, escrowed OTC flow settled in the Unlink ERC-20 token. All calls are routed through Unlink `execute()`, so the on-chain `msg.sender` is a pooled `ExecutionAccount` and the parties stay unlinkable.
* `createListing(trackId, price, licenseType, duration)` — seller lists a track that must be SEALED in the Registry. `licenseType` ∈ {Sync, Beat, Full}; `duration` ∈ {1-year, Perpetual}.
* `purchase(listingId)` — buyer escrows the exact price via ERC-20 `transferFrom` (frontend batches `approve` + `purchase` into one `execute()`).
* `confirmAndRelease(listingId)` — buyer confirms receipt, releasing the escrowed funds to the seller.
* `cancel(listingId)` — seller cancels an unsold listing.

---

## 7. Competitive Differentiation

| Property                                   | US Copyright Office | SACEM / CMOs | Simple NFT Timestamp | The Echo Protocol |
| :-------------------------------------------| :-------------------:| :------------:| :--------------------:| :-----------------:|
| **Trustless**                              | ✗                   | ✗            | ~                    | ✓                 |
| **Confidential (Pre-release)**             | ✗                   | ✗            | ✗                    | ✓                 |
| **Sybil Resistant**                        | ~                   | ~            | ✗                    | ✓                 |
| **Multi-Agent AI Similarity Verification** | ✗                   | ✗            | ✗                    | ✓                 |
| **Registry + Commercial Comparison**       | ✗                   | ✗            | ✗                    | ✓                 |
| **Final Report with Similar Track List**   | ✗                   | ✗            | ✗                    | ✓                 |
| **Instantaneous (< 75s)**                  | ✗                   | ✗            | ✓                    | ✓                 |
| **Confidential Off-chain Store**           | ✗                   | ✗            | ✗                    | ✓                 |

---

## 8. Hackathon Deliverables & Roadmap

### 8.1 Deliverables for ETH Global New York
1. **World ID Integration** — World ID verification gating the pipeline. Humanity is enforced at the agent gate, not on-chain.
2. **4-Step DAG CRE Workflow** — Parallelisation Step 2A ∥ 2B, conditional Step 3, synchronised Step 4. Simulated via CRE CLI, live deployment requested from Chainlink.
3. **Chainlink Confidential AI** — Analysis steps (ACRCloud check, MIDI comparisons, report synthesis) run in a confidential environment; attestations verified by the Registry contract.
4. **Unlink SDK Integration** — private license settlement on `LicenseEscrow` via pooled `ExecutionAccount`s (batched `approve` + `purchase`). Scoped to the licensing layer only.
5. **PostgreSQL Private Registry** — `registry-db`, accessed only via the similarity / registry service APIs.
6. **Final Comparison Report** — Step 4: ranked list of N similar tracks with multidimensional scores and AI commentary.
7. **Front-end Demo** — Next.js / wagmi interface: track upload, World App verification, SEALED certificate generation, comparison report display, and the licensing marketplace.
8. **Public Repository & README** — Complete integration documentation, upstream OSS projects, and details on private/public data boundaries.
