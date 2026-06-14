// ==========================================================================
// Echo — Structured CRE logs for pipeline monitoring / AI enrichment
// --------------------------------------------------------------------------
// Emits grep-friendly JSON lines prefixed with "Logs |". Never logs raw
// audio bytes, full MIDI sequences, or unreleased acoustic fingerprints.
// ==========================================================================

import {
  THRESHOLD_ACR_MIN,
  THRESHOLD_COVER,
  THRESHOLD_PLAGIARISM,
  THRESHOLD_SIMILAR,
  type AcrMatch,
  type PipelineInput,
  type RegistryMatch,
  type ReportResponse,
} from "./types";

export type Logger = (message: string) => void;

const PREFIX = "Logs |";

export type MidiShape = {
  n_notes?: number;
  duration_s?: number;
};

export function summarizeMidiForLogs(midiSequence: string): MidiShape {
  try {
    const parsed = JSON.parse(midiSequence) as MidiShape;
    return {
      n_notes: parsed.n_notes,
      duration_s: parsed.duration_s,
    };
  } catch {
    return {};
  }
}

function logJson(log: Logger, event: string, payload: Record<string, unknown>): void {
  log(`${PREFIX} ${event} ${JSON.stringify(payload)}`);
}

function submissionContext(input: PipelineInput, midiSequence: string) {
  return {
    flowId: input.flowId ?? null,
    trackId: input.trackId,
    commitmentHash: input.commitmentHash,
    registryRef: input.registryRef ?? null,
    audioRef: input.audioRef,
    midi: summarizeMidiForLogs(midiSequence),
    thresholds: {
      acr_plagiarism: THRESHOLD_PLAGIARISM,
      acr_step3_min: THRESHOLD_ACR_MIN,
      registry_similar: THRESHOLD_SIMILAR,
    },
  };
}

function serializeAcrMatch(match: AcrMatch, flags?: { trigger?: boolean; aboveStep3?: boolean }) {
  return {
    ISRC: match.ISRC,
    confidence_score: match.confidence_score,
    title: match.title ?? null,
    artists: match.artists ?? [],
    label: formatAcrLabel(match),
    trigger: flags?.trigger ?? false,
    above_step3_min: flags?.aboveStep3 ?? match.confidence_score >= THRESHOLD_ACR_MIN,
    above_plagiarism_threshold: match.confidence_score >= THRESHOLD_PLAGIARISM,
  };
}

function serializeRegistryMatch(match: RegistryMatch, flags?: { trigger?: boolean }) {
  return {
    track_id: match.track_id,
    similarity_score: match.similarity_score,
    global_overlap: match.global_overlap ?? null,
    hook: match.hook ?? null,
    hook_intervals: match.hook_intervals ?? null,
    trigger: flags?.trigger ?? false,
    above_similar_threshold: match.similarity_score >= THRESHOLD_SIMILAR,
  };
}

function formatAcrLabel(match: AcrMatch): string {
  const artists = match.artists?.filter(Boolean).join(", ");
  if (artists && match.title) return `${artists} — ${match.title}`;
  if (match.title) return match.title;
  if (artists) return artists;
  return match.ISRC ? `ISRC ${match.ISRC}` : "Enregistrement public identifié";
}

/** Snapshot after Step 2 — useful even when the pipeline continues. */
export function logStep2ComparisonSnapshot(
  log: Logger,
  input: PipelineInput,
  midiSequence: string,
  args: {
    acrMatches: AcrMatch[];
    coverMatches?: AcrMatch[];
    registryMatches: RegistryMatch[];
  },
): void {
  const sortedAcr = [...args.acrMatches].sort((a, b) => b.confidence_score - a.confidence_score);
  const sortedRegistry = [...args.registryMatches].sort((a, b) => b.similarity_score - a.similarity_score);

  logJson(log, "step2_snapshot", {
    context: submissionContext(input, midiSequence),
    step2a_acrcloud: {
      match_count: sortedAcr.length,
      matches: sortedAcr.map((match) => serializeAcrMatch(match)),
      cover_match_count: args.coverMatches?.length ?? 0,
      cover_matches: (args.coverMatches ?? []).map((match) => serializeAcrMatch(match)),
      top_match: sortedAcr[0] ? serializeAcrMatch(sortedAcr[0]) : null,
      eligible_for_step3: sortedAcr
        .filter((match) => match.confidence_score >= THRESHOLD_ACR_MIN)
        .map((match) => serializeAcrMatch(match, { aboveStep3: true })),
    },
    step2b_registry: {
      match_count: sortedRegistry.length,
      matches: sortedRegistry.map((match) => serializeRegistryMatch(match)),
      top_match: sortedRegistry[0] ? serializeRegistryMatch(sortedRegistry[0]) : null,
      above_similar_threshold: sortedRegistry
        .filter((match) => match.similarity_score >= THRESHOLD_SIMILAR)
        .map((match) => serializeRegistryMatch(match)),
    },
  });
}

/** Fail-fast REJECTED — acoustic plagiarism (ACRCloud >= 95%). */
export function logPlagiarismHalt(
  log: Logger,
  input: PipelineInput,
  midiSequence: string,
  args: {
    trigger: AcrMatch;
    allMatches: AcrMatch[];
    coverMatches?: AcrMatch[];
    registryMatches: RegistryMatch[];
    report: ReportResponse;
    reason: string;
  },
): void {
  const sortedAcr = [...args.allMatches].sort((a, b) => b.confidence_score - a.confidence_score);

  logJson(log, "fail_fast_rejected", {
    verdict: "REJECTED",
    step: "2A",
    algorithm: "ACRCloud acoustic fingerprint",
    reason: args.reason,
    context: submissionContext(input, midiSequence),
    trigger_match: serializeAcrMatch(args.trigger, { trigger: true }),
    acrcloud_ranking: sortedAcr.map((match) =>
      serializeAcrMatch(match, { trigger: match.ISRC === args.trigger.ISRC && match.confidence_score === args.trigger.confidence_score }),
    ),
    cover_matches: (args.coverMatches ?? []).map((match) => serializeAcrMatch(match)),
    registry_context_at_halt: {
      match_count: args.registryMatches.length,
      matches: [...args.registryMatches]
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .map((match) => serializeRegistryMatch(match)),
      note: "Step 2B finished in parallel; scores are contextual only (2A halted first).",
    },
    report_for_ai: {
      verdict: args.report.verdict,
      ai_summary: args.report.ai_summary,
      similar_tracks: args.report.similar_tracks,
    },
    next_steps: {
      on_chain_seal: false,
      step3_commercial: "skipped",
      step4_report: "skipped",
    },
  });
}

/** Fail-fast REJECTED — humming/cover match (ACRCloud cover bucket >= 85%). */
export function logCoverHalt(
  log: Logger,
  input: PipelineInput,
  midiSequence: string,
  args: {
    trigger: AcrMatch;
    allCoverMatches: AcrMatch[];
    registryMatches: RegistryMatch[];
    report: ReportResponse;
    reason: string;
  },
): void {
  const sorted = [...args.allCoverMatches].sort((a, b) => b.confidence_score - a.confidence_score);
  logJson(log, "fail_fast_cover", {
    verdict: "REJECTED",
    step: "2A",
    algorithm: "ACRCloud humming/cover fingerprint",
    threshold: THRESHOLD_COVER,
    reason: args.reason,
    context: submissionContext(input, midiSequence),
    trigger_match: serializeAcrMatch(args.trigger, { trigger: true }),
    cover_ranking: sorted.map((m) =>
      serializeAcrMatch(m, { trigger: m.ISRC === args.trigger.ISRC && m.confidence_score === args.trigger.confidence_score }),
    ),
    registry_context_at_halt: {
      match_count: args.registryMatches.length,
      matches: [...args.registryMatches]
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .map((m) => serializeRegistryMatch(m)),
    },
    report_for_ai: {
      verdict: args.report.verdict,
      ai_summary: args.report.ai_summary,
      similar_tracks: args.report.similar_tracks,
    },
    next_steps: { on_chain_seal: false, step3_commercial: "skipped", step4_report: "skipped" },
  });
}

/** Fail-fast SIMILAR — private registry MIDI similarity (>= 75%). */
export function logRegistrySimilarHalt(
  log: Logger,
  input: PipelineInput,
  midiSequence: string,
  args: {
    trigger: RegistryMatch;
    allMatches: RegistryMatch[];
    acrMatches: AcrMatch[];
    report: ReportResponse;
    reason: string;
  },
): void {
  const sortedRegistry = [...args.allMatches].sort((a, b) => b.similarity_score - a.similarity_score);

  logJson(log, "fail_fast_similar", {
    verdict: "SIMILAR",
    step: "2B",
    algorithm: "MIDI interval cosine (private registry)",
    reason: args.reason,
    context: submissionContext(input, midiSequence),
    trigger_match: serializeRegistryMatch(args.trigger, { trigger: true }),
    registry_ranking: sortedRegistry.map((match) =>
      serializeRegistryMatch(match, {
        trigger:
          match.track_id === args.trigger.track_id &&
          match.similarity_score === args.trigger.similarity_score,
      }),
    ),
    acrcloud_context_at_halt: {
      match_count: args.acrMatches.length,
      matches: [...args.acrMatches]
        .sort((a, b) => b.confidence_score - a.confidence_score)
        .map((match) => serializeAcrMatch(match)),
      note: "Step 2A finished in parallel; no plagiarism threshold was reached.",
    },
    report_for_ai: {
      verdict: args.report.verdict,
      ai_summary: args.report.ai_summary,
      similar_tracks: args.report.similar_tracks,
    },
    next_steps: {
      on_chain_seal: false,
      step3_commercial: "skipped",
      step4_report: "skipped",
    },
  });
}

/** Terminal blocked pipeline — emitted once more at completion for downstream consumers. */
export function logBlockedPipelineSummary(
  log: Logger,
  input: PipelineInput,
  args: {
    verdict: "REJECTED" | "SIMILAR";
    reason?: string;
    report?: ReportResponse;
  },
): void {
  logJson(log, "pipeline_blocked_summary", {
    flowId: input.flowId ?? null,
    trackId: input.trackId,
    verdict: args.verdict,
    reason: args.reason ?? null,
    report_for_ai: args.report
      ? {
          verdict: args.report.verdict,
          ai_summary: args.report.ai_summary,
          similar_tracks: args.report.similar_tracks,
        }
      : null,
  });
}
