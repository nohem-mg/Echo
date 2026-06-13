// ==========================================================================
// Echo — CRE workflow: 4-step fail-fast DAG
// --------------------------------------------------------------------------
//   Step 1  BasicPitch        audio -> MIDI                    [STOP on failure]
//   Step 2  2A ∥ 2B           ACRCloud (public) ∥ MIDI (private)
//             2A >=95% -> REJECTED (halt) | 2B >=75% -> SIMILAR (halt)
//   Step 3  (after 2A, if matches non-empty) MIDI vs commercial
//   Step 4  (waits for 2B AND 3) acoustic extraction + final report
// --------------------------------------------------------------------------
// Invariants: strict fail-fast, no partial on-chain state; key/BPM from
// raw audio; BasicPitch converts, MIDI algo compares (see AGENTS.md).
// Confidential AI: sensitive agents run via ConfidentialHTTPClient (TEE).
// ==========================================================================

import { HTTPCapability, Runner, handler, type HTTPPayload, type Runtime } from "@chainlink/cre-sdk";
import {
  buildOnChainAttestation,
  verifyAgentAttestations,
} from "./attestation";
import { BackendError } from "./backend";
import { buildRegistryCallback } from "./callback";
import { createBackendClient, type PipelineClient } from "./client";
import { dispatchOnChainCallback } from "./evm-callback";
import { parsePipelineInput } from "./parse-input";
import {
  THRESHOLD_ACR_MIN,
  THRESHOLD_PLAGIARISM,
  THRESHOLD_SIMILAR,
  type CommercialDelta,
  type PipelineInput,
  type PipelineResult,
  type AgentAttestation,
} from "./types";

export type Config = {
  // GAGEXCM backend base URL (e.g. https://echo-backend.xyz).
  backendBaseUrl: string;
  /** Route sensitive agents through ConfidentialHTTPClient (TEE). */
  useConfidentialHttp?: boolean;
  /** Vault DON secret owner (empty string for simulation). */
  secretsOwner?: string;
  /**
   * Registry contract address on Ethereum Sepolia (Cyriac deploy).
   * When set, the DON-signed report is dispatched on-chain for all
   * non-ERROR verdicts. Leave unset to skip the EVM write (simulation mode).
   *
   * TODO: replace placeholder once Cyriac deploys the Registry contract.
   */
  registryAddress?: string;
  /** Gas limit for EVMClient.writeReport (MockKeystoneForwarder routing). */
  writeReportGasLimit?: string;
};

// Minimal logger so the core DAG logic stays decoupled from the CRE runtime.
type Logger = (message: string) => void;

const summarizeMidiRef = (midiSequence: string): string => {
  try {
    const m = JSON.parse(midiSequence) as { n_notes?: number; duration_s?: number };
    return `${m.n_notes ?? "?"} notes, ${m.duration_s ?? "?"}s`;
  } catch {
    return `${midiSequence.length} chars`;
  }
};

const formatMatches2a = (matches: { ISRC: string; confidence_score: number }[]) =>
  matches.length === 0
    ? "none"
    : matches.map((m) => `${m.ISRC}@${m.confidence_score}%`).join(", ");

const formatMatches2b = (matches: { track_id: string; similarity_score: number }[]) =>
  matches.length === 0
    ? "none"
    : matches.map((m) => `${m.track_id.slice(0, 10)}…@${m.similarity_score}%`).join(", ");

// Fail-fast halt: returns a terminal verdict with no partial state.
const halt = (
  input: PipelineInput,
  verdict: PipelineResult["verdict"],
  reason: string,
  agentAttestations?: readonly AgentAttestation[],
): PipelineResult => ({
  verdict,
  trackId: input.trackId,
  commitmentHash: input.commitmentHash,
  reason,
  agentAttestations,
});

// Build DON-signed report + dispatch on-chain callback for all non-ERROR verdicts.
const finalizeResult = (
  runtime: Runtime<Config>,
  client: PipelineClient,
  result: PipelineResult,
): PipelineResult => {
  // ERROR = infrastructure failure; no on-chain state written.
  if (result.verdict === "ERROR") return result;
  // SIMILAR / REJECTED = fail-fast halt; no partial state written on-chain (AGENTS.md).
  if (result.verdict === "SIMILAR" || result.verdict === "REJECTED") return result;

  const agentAttestations = client.getAgentAttestations();
  if (agentAttestations.length > 0) {
    verifyAgentAttestations(agentAttestations);
    runtime.log(`Confidential AI — ${agentAttestations.length} agent attestation(s) verified`);
  }

  const withAgents: PipelineResult =
    agentAttestations.length > 0 ? { ...result, agentAttestations } : result;

  const { attestation, report } = buildOnChainAttestation(runtime, withAgents);
  runtime.log(`CRE attestation ready for callback (${attestation.slice(0, 18)}…)`);

  // Dispatch on-chain when Cyriac provides a real Registry address (not zero / placeholder).
  const registry = runtime.config.registryAddress?.toLowerCase();
  if (registry && registry !== "0x0000000000000000000000000000000000000000") {
    dispatchOnChainCallback(
      runtime,
      runtime.config.registryAddress!,
      report,
      runtime.config.writeReportGasLimit,
    );
  }

  // PipelineResult.callback is only set for CLEAN (the SEALED entry on-chain).
  if (withAgents.verdict !== "CLEAN" || !withAgents.report) {
    return { ...withAgents, attestation };
  }

  const callback = buildRegistryCallback({ ...withAgents, attestation });
  return { ...withAgents, attestation, callback };
};

// --------------------------------------------------------------------------
// DAG orchestration (pure: depends only on a logger + an injectable client,
// so it is fully unit-testable without network or CRE runtime).
// --------------------------------------------------------------------------
export const runPipelineWithClient = (
  log: Logger,
  client: PipelineClient,
  input: PipelineInput,
): PipelineResult => {
  try {
    log(`Input — trackId=${input.trackId}  audioRef=${input.audioRef}`);

    // ---- Step 1 — audio -> MIDI conversion (prerequisite for 2A and 2B) --
    log("Step 1 — audio -> MIDI conversion (BasicPitch)");
    const { midiSequence } = client.convert(input.audioRef).result();
    log(`Step 1 OK — midiSequence: ${summarizeMidiRef(midiSequence)}`);

    // ---- Step 2 — 2A ∥ 2B ------------------------------------------------
    log("Step 2 — parallel comparison 2A ∥ 2B");
    const handle2a = client.checkPublic(input.audioRef);
    const handle2b = client.comparePrivate(midiSequence);
    const matches = handle2a.result().matches;
    const registryMatches = handle2b.result().registry_matches;
    log(`Step 2A OK — ACRCloud matches (≥50%): ${formatMatches2a(matches)}`);
    log(`Step 2B OK — registry matches: ${formatMatches2b(registryMatches)}`);

    // ---- Fail-fast 2A: obvious plagiarism ---------------------------------
    const plagiarism = matches.find((m) => m.confidence_score >= THRESHOLD_PLAGIARISM);
    if (plagiarism) {
      log(`STOP 2A — plagiarism (${plagiarism.confidence_score}% on ${plagiarism.ISRC})`);
      return halt(
        input,
        "REJECTED",
        `ACRCloud plagiarism ${plagiarism.confidence_score}%`,
        client.getAgentAttestations(),
      );
    }

    // ---- Fail-fast 2B: similar to private registry ----------------------
    const similar = registryMatches.find((m) => m.similarity_score >= THRESHOLD_SIMILAR);
    if (similar) {
      log(`STOP 2B — SIMILAR (${similar.similarity_score}% vs ${similar.track_id})`);
      return halt(
        input,
        "SIMILAR",
        `private registry match ${similar.similarity_score}%`,
        client.getAgentAttestations(),
      );
    }

    // ---- Step 3 — conditional: only if 2A has matches ---------------------
    // (>=50% only; <50% -> Step 3 skipped.)
    const eligibleISRCs = matches
      .filter((m) => m.confidence_score >= THRESHOLD_ACR_MIN)
      .map((m) => m.ISRC);

    let commercialDeltas: CommercialDelta[] = [];
    if (eligibleISRCs.length > 0) {
      log(`Step 3 — MIDI comparison vs ISRCs: ${eligibleISRCs.join(", ")}`);
      commercialDeltas = client.compareCommercial(midiSequence, eligibleISRCs).result()
        .commercial_deltas;
      log(`Step 3 OK — ${commercialDeltas.length} commercial delta(s)`);
    } else {
      log("Step 3 — skipped (no ACRCloud match >= 50%)");
    }

    // ---- Step 4 — waits for 2B AND 3: acoustic extraction + report -------
    log("Step 4 — acoustic extraction (raw audio) + final report");
    const report = client
      .report({
        audioRef: input.audioRef,
        midiSequence,
        registry_matches: registryMatches,
        commercial_deltas: commercialDeltas,
      })
      .result();

    log(
      `Step 4 OK — verdict=${report.verdict}  key=${report.submitted_track.key} ${report.submitted_track.mode}  BPM=${report.submitted_track.BPM}  fp=${report.submitted_track.fingerprint}`,
    );
    if (report.similar_tracks.length > 0) {
      log(`  similar_tracks: ${report.similar_tracks.map((t) => `#${t.rank} ${t.title} (${t.score}%)`).join(" | ")}`);
    }
    log(`  ai_summary: ${report.ai_summary}`);

    log(`Final verdict: ${report.verdict}`);

    // SEAL — persist in private registry before on-chain callback (CLEAN only).
    if (report.verdict === "CLEAN") {
      log(`SEAL — POST /api/registry  trackId=${input.trackId}  fingerprint=${report.submitted_track.fingerprint}`);
      client.register({
        trackId: input.trackId,
        midiSequence,
        fingerprint: report.submitted_track.fingerprint,
      }).result();
      log("SEAL OK — track persisted in private registry");
    }

    return {
      verdict: report.verdict,
      trackId: input.trackId,
      commitmentHash: input.commitmentHash,
      report,
      agentAttestations: client.getAgentAttestations(),
    };
  } catch (err) {
    // Global fail-fast: any HTTP/timeout error -> ERROR, no partial state.
    const reason = err instanceof BackendError ? err.message : `pipeline error: ${String(err)}`;
    log(`STOP — ${reason}`);
    return halt(input, "ERROR", reason, client.getAgentAttestations());
  }
};

// Runtime wrapper: builds the real backend client from config and runs the DAG.
export const runPipeline = (runtime: Runtime<Config>, input: PipelineInput): PipelineResult => {
  const client = createBackendClient(runtime, runtime.config.backendBaseUrl, {
    useConfidentialHttp: runtime.config.useConfidentialHttp,
    secretsOwner: runtime.config.secretsOwner,
  });
  const result = runPipelineWithClient((m) => runtime.log(m), client, input);
  return finalizeResult(runtime, client, result);
};

// --------------------------------------------------------------------------
// HTTP trigger: pipeline entry point (track submission)
// --------------------------------------------------------------------------
const onSubmission = (runtime: Runtime<Config>, payload: HTTPPayload): PipelineResult => {
  const input = parsePipelineInput(JSON.parse(new TextDecoder().decode(payload.input)));
  runtime.log(`Echo — new submission (commitment ${input.commitmentHash.slice(0, 10)}…)`);
  if (runtime.config.useConfidentialHttp) {
    runtime.log("Confidential AI — sensitive agents routed via ConfidentialHTTPClient");
  }
  return runPipeline(runtime, input);
};

export const initWorkflow = (_config: Config) => {
  const http = new HTTPCapability();
  return [handler(http.trigger({}), onSubmission)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
