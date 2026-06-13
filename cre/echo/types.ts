// ==========================================================================
// Echo — CRE pipeline <-> backend (GAGEXCM) interface contracts
// Source of truth: docs/Echo_ETHGlobalNY2026_FR_v3.md §3
// ==========================================================================

// Final pipeline verdict, written on-chain via Registry callback.
export type Verdict = "CLEAN" | "SIMILAR" | "REJECTED" | "ERROR";

// --------------------------------------------------------------------------
// Pipeline input (HTTP trigger payload)
// --------------------------------------------------------------------------
export type PipelineInput = {
  // Raw audio reference (encrypted Walrus blob or signed backend URL).
  audioRef: string;
  // keccak256(fingerprint + JSON profile) — sealed on-chain at registration.
  commitmentHash: string;
  // World ID nullifier (anti-Sybil), passed through to the callback.
  worldNullifier: string;
};

// --------------------------------------------------------------------------
// Step 1 — POST /api/convert  (BasicPitch: audio -> MIDI)
// --------------------------------------------------------------------------
export type ConvertResponse = {
  // Reference to the produced MIDI sequence (reused by 2B and 3).
  midiSequence: string;
};

// --------------------------------------------------------------------------
// Step 2A — POST /api/check/public  (ACRCloud: fingerprint vs public base)
// --------------------------------------------------------------------------
export type AcrMatch = {
  ISRC: string;
  confidence_score: number; // % of matching landmarks
};

export type CheckPublicResponse = {
  matches: AcrMatch[];
};

// --------------------------------------------------------------------------
// Step 2B — POST /api/compare/private  (MIDI algo vs private Walrus registry)
// --------------------------------------------------------------------------
export type RegistryMatch = {
  track_id: string;
  similarity_score: number; // true compositional similarity %
};

export type ComparePrivateResponse = {
  registry_matches: RegistryMatch[];
};

// --------------------------------------------------------------------------
// Step 3 — POST /api/compare/commercial  (submitted MIDI vs commercial MIDIs)
// --------------------------------------------------------------------------
export type CommercialDelta = {
  ISRC: string;
  melodic: number;
  rhythmic: number;
  structural: number;
};

export type CompareCommercialResponse = {
  commercial_deltas: CommercialDelta[];
};

// --------------------------------------------------------------------------
// Step 4 — POST /api/report  (acoustic extraction + ranked final report)
// --------------------------------------------------------------------------
export type SubmittedTrack = {
  key: string;
  mode: string;
  BPM: number;
  fingerprint: string;
};

export type SimilarTrack = {
  rank: number;
  title: string;
  source: "ACRCloud" | "Registre privé"; // exact API value — do not translate
  score: number;
  melody: number;
  rhythm: number;
  structure: number;
  key: string;
  BPM: number;
};

export type ReportResponse = {
  // Backend decides CLEAN | SIMILAR based on best match (<75% / >=75%).
  verdict: "CLEAN" | "SIMILAR";
  submitted_track: SubmittedTrack;
  similar_tracks: SimilarTrack[];
  ai_summary: string;
};

// --------------------------------------------------------------------------
// Confidential AI — per-agent TEE attestation (response header)
// --------------------------------------------------------------------------
export type AgentAttestation = {
  /** Pipeline step identifier (e.g. step1-convert). */
  step: string;
  /** Opaque attestation blob from the Confidential AI enclave. */
  attestation: string;
};

// --------------------------------------------------------------------------
// Workflow output (handler return value / on-chain callback input)
// --------------------------------------------------------------------------
export type PipelineResult = {
  verdict: Verdict;
  commitmentHash: string;
  // Human-readable reason on halt (plagiarism, similar, error).
  reason?: string;
  // Full report when the pipeline completes (CLEAN or SIMILAR).
  report?: ReportResponse;
  /** Per-agent TEE attestations collected during confidential HTTP calls. */
  agentAttestations?: readonly AgentAttestation[];
  /** DON-signed CRE rawReport (hex) for Registry.receiveCRECallback(). */
  attestation?: string;
  /** Ready-to-send callback when verdict is CLEAN (section 5 wiring). */
  callback?: {
    verdict: "CLEAN";
    commitmentHash: string;
    attestation: string;
  };
};

// --------------------------------------------------------------------------
// Fail-fast thresholds (doc §3 — non-negotiable invariants)
// --------------------------------------------------------------------------
export const THRESHOLD_PLAGIARISM = 95; // 2A: >=95% -> REJECTED (halt)
export const THRESHOLD_SIMILAR = 75; //    2B: >=75% -> SIMILAR (halt)
export const THRESHOLD_ACR_MIN = 50; //    2A: <50% -> Step 3 skipped
