"use client";

import { Sparkles } from "lucide-react";
import { formatVerdictBadge, type VerdictInfo } from "@/lib/flow/flow-status";
import { fmtScore, scoreTone, type ReportTableMatch } from "@/lib/flow/report";
import type { EchoFlowStatus, EchoPublicReference, EchoReport } from "@/lib/types";

type ReportSectionProps = {
  verdict: VerdictInfo;
  report?: EchoReport;
  matches: ReportTableMatch[];
  publicReferences: EchoPublicReference[];
  flowStatus?: EchoFlowStatus;
  flowError?: string;
  pipelineStarted: boolean;
  blockedStepReason?: string;
};

function MatchTable({ matches, report, publicReferences }: Pick<ReportSectionProps, "matches" | "report" | "publicReferences">) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-white/15 bg-[#080808]">
      <div className="grid grid-cols-[56px_1.6fr_repeat(6,minmax(92px,1fr))] overflow-x-auto text-sm">
        <div className="contents text-white/45">
          <div className="min-w-14 border-b border-white/10 p-4">#</div>
          <div className="min-w-64 border-b border-white/10 p-4">Track</div>
          <div className="min-w-24 border-b border-white/10 p-4">Global</div>
          <div className="min-w-24 border-b border-white/10 p-4 flex items-center gap-1">
            Melody
            {matches[0]?.global_overlap !== undefined && (
              <span className="text-[10px] text-white/30 font-normal">(n-gram)</span>
            )}
          </div>
          <div className="min-w-24 border-b border-white/10 p-4">Rhythm</div>
          <div className="min-w-24 border-b border-white/10 p-4 flex items-center gap-1">
            Hook
            {matches[0]?.hook !== undefined && (
              <span className="text-[10px] text-white/30 font-normal">(S-W)</span>
            )}
          </div>
          <div className="min-w-28 border-b border-white/10 p-4">
            {matches[0]?.hook_intervals !== undefined ? "Phrase len." : "Key / BPM"}
          </div>
          <div className="min-w-32 border-b border-white/10 p-4">Source</div>
        </div>
        {matches.map((match) => (
          <div className="contents" key={match.rank}>
            <div className="min-w-14 border-b border-white/10 p-4 text-white/55">{match.rank}</div>
            <div className="min-w-64 border-b border-white/10 p-4 font-bold">{match.title}</div>
            <div className={`min-w-24 border-b border-white/10 p-4 font-black ${scoreTone(match.score)}`}>{fmtScore(match.score)}%</div>
            <div className="min-w-24 border-b border-white/10 p-4 text-white/65">{match.melody !== undefined ? `${fmtScore(match.melody)}%` : <span className="text-white/25">—</span>}</div>
            <div className="min-w-24 border-b border-white/10 p-4 text-white/65">{match.rhythm !== undefined ? `${fmtScore(match.rhythm)}%` : <span className="text-white/25">—</span>}</div>
            <div className="min-w-24 border-b border-white/10 p-4 text-white/65">{match.structure !== undefined ? `${fmtScore(match.structure)}%` : <span className="text-white/25">—</span>}</div>
            <div className="min-w-28 border-b border-white/10 p-4 text-white/65">{match.keyLabel}</div>
            <div className="min-w-32 border-b border-white/10 p-4 text-white/65">{match.source}</div>
          </div>
        ))}
      </div>
      {report?.ai_summary ? (
        <p className="border-t border-white/10 p-4 text-sm leading-6 text-white/65">{report.ai_summary}</p>
      ) : null}
      {publicReferences.length > 0 ? (
        <div className="border-t border-[#8fd5ff]/20 bg-[#8fd5ff]/5">
          <div className="border-b border-[#8fd5ff]/15 px-5 py-4">
            <p className="font-hand text-xl text-[#8fd5ff]">public references detected</p>
            <p className="mt-1 text-sm text-white/55">
              ACRCloud humming — informational signal (cover block threshold: 85%).
            </p>
          </div>
          <div className="divide-y divide-white/10">
            {publicReferences.map((reference) => (
              <div className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto]" key={`${reference.ISRC ?? reference.title}-${reference.rank}`}>
                <div>
                  <p className="font-bold text-white/90">{reference.title}</p>
                  {reference.ISRC ? (
                    <p className="mt-1 font-mono text-xs text-white/45">{reference.ISRC}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl font-black text-[#8fd5ff]">{fmtScore(reference.score)}%</p>
                  <p className="text-xs text-white/45">{reference.source}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SubmittedTrackSummary({ report, verdict }: { report: EchoReport; verdict: VerdictInfo }) {
  const metrics = [
    {
      label: "Key / mode",
      value: `${report.submitted_track?.key ?? "Unknown"} ${report.submitted_track?.mode ?? ""}`.trim(),
    },
    {
      label: "BPM",
      value: typeof report.submitted_track?.BPM === "number" ? String(report.submitted_track.BPM) : "Unknown",
    },
    {
      label: "Fingerprint",
      value: report.submitted_track?.fingerprint
        ? `${report.submitted_track.fingerprint.slice(0, 18)}...`
        : "Not provided",
    },
  ];

  return (
    <div className="rounded-[8px] border border-white/15 bg-[#080808] p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((item) => (
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4" key={item.label}>
            <p className="text-xs uppercase tracking-wider text-white/40">{item.label}</p>
            <p className="mt-2 break-words font-mono text-sm text-white/80">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-[8px] border border-[#9ef7c9]/20 bg-[#9ef7c9]/10 p-5">
        <p className={`font-bold ${verdict.colorClass}`}>
          {report.verdict === "CLEAN"
            ? "No similar tracks above the report threshold."
            : "Final report received without ranked similarity rows."}
        </p>
        {report.ai_summary ? (
          <p className="mt-3 text-sm leading-6 text-white/70">{report.ai_summary}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ReportSection({
  verdict,
  report,
  matches,
  publicReferences,
  flowStatus,
  flowError,
  pipelineStarted,
  blockedStepReason,
}: ReportSectionProps) {
  return (
    <section id="report" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="echo-hand-float font-hand text-3xl text-[#fff7cf]" style={{ animationDelay: "0.3s" }}>
              verdict board
            </p>
            <h2 className={`mt-3 font-display text-[clamp(2.8rem,6vw,6rem)] font-black leading-[0.9] ${verdict.colorClass}`}>
              {verdict.title}
            </h2>
            <p className="mt-2 text-white/60 text-lg">{verdict.subtitle}</p>
          </div>
          <div className={`rounded-full border px-5 py-3 font-black ${verdict.badgeClass}`}>
            {formatVerdictBadge(verdict)}
          </div>
        </div>

        {verdict.showMatches && matches.length > 0 ? (
          <MatchTable matches={matches} report={report} publicReferences={publicReferences} />
        ) : verdict.showMatches && report ? (
          <SubmittedTrackSummary report={report} verdict={verdict} />
        ) : flowStatus === "pipeline_blocked" || flowStatus === "error" ? (
          <div className="rounded-[8px] border border-dashed border-white/15 bg-white/[0.01] p-12 text-center text-white/55">
            <p className="font-bold text-white/80">
              {flowStatus === "pipeline_blocked" ? "Analysis complete — no on-chain seal" : "Pipeline error"}
            </p>
            <p className="mt-3 text-sm leading-6">
              {report?.ai_summary
                ?? blockedStepReason
                ?? flowError
                ?? "No Network transaction was created."}
            </p>
            {flowError?.includes("Trial épuisé") && (
              <button
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#f59abd]/50 bg-[#f59abd]/10 px-6 py-2.5 text-sm font-bold text-[#f59abd] transition hover:bg-[#f59abd]/20 cursor-not-allowed opacity-70"
                disabled
              >
                <Sparkles className="size-4" />
                Pay with AgentKit (Coming Soon)
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-[8px] border border-dashed border-white/15 bg-white/[0.01] p-12 text-center text-white/45">
            {pipelineStarted ? "Verification in progress..." : "No track has been verified yet."}
          </div>
        )}
      </div>
    </section>
  );
}
