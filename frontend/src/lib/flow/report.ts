import type { EchoFlow, EchoPipelineStep, EchoReport, EchoSimilarTrack } from "@/lib/types";

export type ReportTableMatch = EchoSimilarTrack & {
  keyLabel: string;
};

export function fmtScore(score: number): string {
  return score % 1 === 0 ? `${score}` : score.toFixed(1);
}

export function scoreTone(score: number): string {
  if (score >= 75) {
    return "text-[#ff7777]";
  }

  if (score >= 50) {
    return "text-[#ffd166]";
  }

  return "text-[#9ef7c9]";
}

export function normalizeReportMatches(report?: EchoReport): ReportTableMatch[] {
  if (!report?.similar_tracks?.length) {
    return [];
  }

  return report.similar_tracks.map((match) => {
    let keyLabel: string;
    const musicalKey = match.key.startsWith("ISRC") ? "" : match.key;
    if (musicalKey && typeof match.BPM === "number" && match.BPM > 0) {
      keyLabel = `${musicalKey} / ${match.BPM}`;
    } else if (match.hook_intervals && match.hook_intervals > 0) {
      keyLabel = `${match.hook_intervals} intv.`;
    } else {
      keyLabel = musicalKey || "—";
    }
    return { ...match, keyLabel };
  });
}

export function getBestMatch(report?: EchoReport): number {
  return report?.similar_tracks?.reduce((max, match) => Math.max(max, match.score), 0) ?? 0;
}

type BlockedMatchDetail = {
  label?: string;
  ISRC?: string;
  title?: string;
  artists?: string[];
  score?: number;
};

function parseBlockedStepDetail(detail?: string): BlockedMatchDetail | undefined {
  if (!detail || !detail.trim().startsWith("{")) {
    return undefined;
  }

  try {
    return JSON.parse(detail) as BlockedMatchDetail;
  } catch {
    return undefined;
  }
}

function formatBlockedMatchLabel(detail?: BlockedMatchDetail, meta?: string): string | undefined {
  if (detail?.label) {
    return detail.label;
  }

  const artists = detail?.artists?.filter(Boolean).join(", ");
  if (artists && detail?.title) {
    return `${artists} — ${detail.title}`;
  }
  if (detail?.title) {
    return detail.title;
  }
  if (artists) {
    return artists;
  }
  if (detail?.ISRC) {
    return `ISRC ${detail.ISRC}`;
  }
  if (meta && !meta.startsWith("Match:")) {
    return meta.replace(/\s·\s\d+%$/, "");
  }

  return undefined;
}

/**
 * When the pipeline stops without a final report (blocked on step 02A/02B),
 * synthesize a minimal report from the blocked step's metadata so the verdict
 * board still shows what was matched.
 */
export function buildFallbackBlockedReport(flow: EchoFlow | null, steps: EchoPipelineStep[]): EchoReport | undefined {
  if (!flow || flow.status !== "pipeline_blocked") {
    return undefined;
  }

  const blocked2a = steps.find((step) => step.stepKey === "02A" && step.status === "blocked");
  const blocked2b = steps.find((step) => step.stepKey === "02B" && step.status === "blocked");
  const blockedStep = blocked2a ?? blocked2b;
  if (!blockedStep) {
    return undefined;
  }

  const parsedDetail = parseBlockedStepDetail(blockedStep.detail);
  const scoreMatch =
    blockedStep.meta?.match(/(\d+)%/) ??
    blockedStep.reason?.match(/(\d+)%/) ??
    (parsedDetail?.score ? [`${parsedDetail.score}`, `${parsedDetail.score}`] : null);
  const score = parsedDetail?.score ?? (scoreMatch ? Number(scoreMatch[1]) : 0);
  const isPlagiarism = blockedStep.stepKey === "02A";
  const matchLabel =
    formatBlockedMatchLabel(parsedDetail, blockedStep.meta) ??
    (isPlagiarism ? "ACRCloud match" : "Private registry similarity");
  const isrcKey = parsedDetail?.ISRC ? `ISRC ${parsedDetail.ISRC}` : "—";

  return {
    verdict: isPlagiarism ? "REJECTED" : "SIMILAR",
    similar_tracks: [
      {
        rank: 1,
        title: matchLabel,
        source: isPlagiarism ? "ACRCloud" : "Private registry",
        score,
        key: isPlagiarism ? isrcKey : "MIDI",
      },
    ],
    ai_summary: isPlagiarism
      ? `Plagiarism detected (${fmtScore(score)}%) — match with « ${matchLabel} ».`
      : blockedStep.reason ?? flow.error ?? "Analysis halted — no on-chain seal.",
  };
}

export function resolveActiveReport(
  flow: EchoFlow | null,
  steps: EchoPipelineStep[],
  mockReport?: EchoReport,
): EchoReport | undefined {
  if (flow?.report?.similar_tracks?.length) {
    const primaryTitle = flow.report.similar_tracks[0]?.title ?? "";
    if (!primaryTitle.startsWith("ACRCloud plagiarism")) {
      return flow.report;
    }
  }

  const fallback = buildFallbackBlockedReport(flow, steps);
  if (fallback) {
    return fallback;
  }

  if (flow?.report) {
    return flow.report;
  }

  return mockReport;
}
