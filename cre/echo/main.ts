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
// ==========================================================================

import { HTTPCapability, Runner, handler, type HTTPPayload, type Runtime } from "@chainlink/cre-sdk";
import { BackendError } from "./backend";
import {
  stepCheckPublic,
  stepCompareCommercial,
  stepComparePrivate,
  stepConvert,
  stepReport,
} from "./steps";
import {
  THRESHOLD_ACR_MIN,
  THRESHOLD_PLAGIARISM,
  THRESHOLD_SIMILAR,
  type CommercialDelta,
  type PipelineInput,
  type PipelineResult,
} from "./types";

export type Config = {
  // GAGEXCM backend base URL (e.g. https://echo-backend.xyz).
  backendBaseUrl: string;
};

// Fail-fast halt: returns a terminal verdict with no partial state.
const halt = (
  input: PipelineInput,
  verdict: PipelineResult["verdict"],
  reason: string,
): PipelineResult => ({ verdict, commitmentHash: input.commitmentHash, reason });

// --------------------------------------------------------------------------
// DAG orchestration
// --------------------------------------------------------------------------
export const runPipeline = (runtime: Runtime<Config>, input: PipelineInput): PipelineResult => {
  const baseUrl = runtime.config.backendBaseUrl;

  try {
    // ---- Step 1 — audio -> MIDI conversion (prerequisite for 2A and 2B) --
    runtime.log("Step 1 — audio -> MIDI conversion (BasicPitch)");
    const { midiSequence } = stepConvert(runtime, baseUrl, input.audioRef).result();

    // ---- Step 2 — 2A ∥ 2B ------------------------------------------------
    // Start both deferred calls BEFORE resolving — CRE equivalent of Promise.all.
    // 2A: ACRCloud (raw audio) | 2B: MIDI algo (private registry).
    runtime.log("Step 2 — parallel comparison 2A ∥ 2B");
    const handle2a = stepCheckPublic(runtime, baseUrl, input.audioRef);
    const handle2b = stepComparePrivate(runtime, baseUrl, midiSequence);
    const matches = handle2a.result().matches;
    const registryMatches = handle2b.result().registry_matches;

    // ---- Fail-fast 2A: obvious plagiarism ---------------------------------
    const plagiarism = matches.find((m) => m.confidence_score >= THRESHOLD_PLAGIARISM);
    if (plagiarism) {
      runtime.log(`STOP 2A — plagiarism (${plagiarism.confidence_score}% on ${plagiarism.ISRC})`);
      return halt(input, "REJECTED", `ACRCloud plagiarism ${plagiarism.confidence_score}%`);
    }

    // ---- Fail-fast 2B: similar to private registry ----------------------
    const similar = registryMatches.find((m) => m.similarity_score >= THRESHOLD_SIMILAR);
    if (similar) {
      runtime.log(`STOP 2B — SIMILAR (${similar.similarity_score}% vs ${similar.track_id})`);
      return halt(input, "SIMILAR", `private registry match ${similar.similarity_score}%`);
    }

    // ---- Step 3 — conditional: only if 2A has matches ---------------------
    // (>=50% only; <50% -> Step 3 skipped.)
    const eligibleISRCs = matches
      .filter((m) => m.confidence_score >= THRESHOLD_ACR_MIN)
      .map((m) => m.ISRC);

    let commercialDeltas: CommercialDelta[] = [];
    if (eligibleISRCs.length > 0) {
      runtime.log(`Step 3 — MIDI comparison vs ${eligibleISRCs.length} commercial track(s)`);
      commercialDeltas = stepCompareCommercial(
        runtime,
        baseUrl,
        midiSequence,
        eligibleISRCs,
      ).result().commercial_deltas;
    } else {
      runtime.log("Step 3 — skipped (no ACRCloud match >= 50%)");
    }

    // ---- Step 4 — waits for 2B AND 3: acoustic extraction + report -------
    runtime.log("Step 4 — acoustic extraction (raw audio) + final report");
    const report = stepReport(runtime, baseUrl, {
      audioRef: input.audioRef,
      midiSequence,
      registry_matches: registryMatches,
      commercial_deltas: commercialDeltas,
    }).result();

    runtime.log(`Final verdict: ${report.verdict}`);
    return {
      verdict: report.verdict,
      commitmentHash: input.commitmentHash,
      report,
    };
  } catch (err) {
    // Global fail-fast: any HTTP/timeout error -> ERROR, no partial state.
    const reason = err instanceof BackendError ? err.message : `pipeline error: ${String(err)}`;
    runtime.log(`STOP — ${reason}`);
    return halt(input, "ERROR", reason);
  }
};

// --------------------------------------------------------------------------
// HTTP trigger: pipeline entry point (track submission)
// --------------------------------------------------------------------------
const onSubmission = (runtime: Runtime<Config>, payload: HTTPPayload): PipelineResult => {
  const input = JSON.parse(new TextDecoder().decode(payload.input)) as PipelineInput;
  runtime.log(`Echo — new submission (commitment ${input.commitmentHash.slice(0, 10)}…)`);
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
