"use client";

import { Copy, ExternalLink } from "lucide-react";
import { echoConfig } from "@/lib/config";
import { fmtScore } from "@/lib/flow/report";
import type { EchoFlow, EchoPublicReference, EchoReport } from "@/lib/types";
import { sepolia } from "wagmi/chains";

function CertificateMetric({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div className="min-h-28 rounded-[8px] border border-[#050505]/15 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold uppercase text-[#050505]/45">{label}</p>
        {copyValue ? (
          <button
            className="grid size-8 shrink-0 place-items-center rounded-full border border-[#050505]/15 text-[#050505]/55 transition hover:border-[#050505] hover:text-[#050505]"
            onClick={async () => navigator.clipboard.writeText(copyValue)}
            type="button"
            aria-label={`Copy ${label}`}
          >
            <Copy className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p className="mt-4 break-words font-display text-2xl font-black">{value}</p>
    </div>
  );
}

type SealCertificateProps = {
  flow: EchoFlow | null;
  hasRegistrySeal: boolean;
  report?: EchoReport;
  publicReferences: EchoPublicReference[];
  blockedStepReason?: string;
  trackId?: `0x${string}`;
  txHash?: `0x${string}`;
};

function BlockedCard({ report, publicReferences, blockedStepReason }: Pick<SealCertificateProps, "report" | "publicReferences" | "blockedStepReason">) {
  const primaryMatch = report?.similar_tracks?.[0];

  return (
    <div className="relative overflow-hidden rounded-[8px] border border-[#ff7777]/30 bg-[#ff7777]/5 p-6 text-[#ff7777] sm:p-8 flex flex-col justify-between">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#ff7777]/25 bg-[#ff7777]/10 px-4 py-1.5 text-sm font-bold uppercase tracking-wider">
          ⚠️ Registration Blocked
        </div>
        <h2 className="mt-6 font-display text-[clamp(2.5rem,6vw,5.5rem)] font-black leading-[0.86] text-white">
          Novelty Check Failed
        </h2>
        <p className="mt-4 text-lg text-white/80 max-w-2xl leading-relaxed">
          This track did not pass the prior-art criteria. Echo has halted the execution to prevent duplicate or plagiarized works from being sealed on-chain.
        </p>
        <div className="mt-8 rounded-[8px] border border-[#ff7777]/20 bg-[#ff7777]/10 p-5 text-white/90">
          <span className="font-bold text-white">Match detected:</span>
          <p className="mt-1 text-sm leading-6">
            {primaryMatch?.title ?? blockedStepReason ?? "High similarity detected."}
          </p>
          {primaryMatch?.score ? (
            <div className="mt-2 font-mono text-sm text-white/75 space-y-1">
              <p>
                Score <span className="font-black text-white">{fmtScore(primaryMatch.score)}%</span>
                {primaryMatch.key.startsWith("ISRC") ? ` · ${primaryMatch.key}` : null}
              </p>
              {primaryMatch.global_overlap !== undefined && (
                <p className="text-xs text-white/55">
                  Global melody: {fmtScore(primaryMatch.global_overlap)}%
                  {primaryMatch.hook !== undefined && (
                    <> · Distinctive phrase: {fmtScore(primaryMatch.hook)}%</>
                  )}
                  {primaryMatch.hook_intervals ? (
                    <> · {primaryMatch.hook_intervals} intervals</>
                  ) : null}
                </p>
              )}
            </div>
          ) : null}
          {report?.ai_summary ? (
            <p className="mt-3 font-mono text-xs text-white/60">{report.ai_summary}</p>
          ) : null}
          {publicReferences.length > 0 ? (
            <div className="mt-4 rounded-[8px] border border-[#8fd5ff]/20 bg-[#8fd5ff]/10 p-4 text-white/85">
              <p className="text-sm font-bold text-[#8fd5ff]">Public references also detected</p>
              <ul className="mt-2 space-y-1 text-sm text-white/75">
                {publicReferences.slice(0, 3).map((reference) => (
                  <li key={`${reference.ISRC ?? reference.title}-${reference.rank}`}>
                    {reference.title} · {fmtScore(reference.score)}%
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-10 font-bold text-white/45 text-sm">
        No on-chain seal was created.
      </div>
    </div>
  );
}

function SealedCard({ flow, trackId, txHash }: Pick<SealCertificateProps, "flow" | "trackId" | "txHash">) {
  return (
    <div className="relative overflow-hidden rounded-[8px] border border-white/15 bg-[#f8f6ee] p-6 text-[#050505] sm:p-8">
      <div className="echo-seal-pulse absolute right-8 top-8 rounded-full bg-[#050505] px-4 py-2 text-sm font-black text-[#f8f6ee]">
        SEALED
      </div>
      <p className="echo-hand-float font-hand text-3xl text-[#f59abd]" style={{ animationDelay: "0.8s" }}>
        sealed certificate
      </p>
      <h2 className="mt-4 max-w-3xl font-display text-[clamp(3rem,7vw,7rem)] font-black leading-[0.86]">
        Proof that keeps the music yours.
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CertificateMetric
          label="Commitment hash"
          value={flow?.commitmentHash ?? "Not provided"}
          copyValue={flow?.commitmentHash}
        />
        <CertificateMetric
          label="Registry ref"
          value={flow?.registryRef ?? "Not provided"}
          copyValue={flow?.registryRef}
        />
        <CertificateMetric
          label="Track ID"
          value={trackId ?? "Not provided"}
          copyValue={trackId}
        />
        <CertificateMetric
          label="Network tx"
          value={txHash ?? "Not provided"}
          copyValue={txHash ?? undefined}
        />
        <CertificateMetric
          label="Timestamp"
          value={
            flow?.updatedAt
              ? new Date(flow.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
              : "Not provided"
          }
        />
        <CertificateMetric
          label="Network"
          value={echoConfig.registryChainId === sepolia.id ? "Ethereum Sepolia" : `Chain ${echoConfig.registryChainId}`}
        />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <a
          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#050505]/20 px-5 font-black transition hover:border-[#050505]"
          href={`${echoConfig.registryExplorer}/tx/${txHash}#internal`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Etherscan
        </a>
      </div>
    </div>
  );
}

function PendingCard({ flow }: Pick<SealCertificateProps, "flow">) {
  return (
    <div className="relative overflow-hidden rounded-[8px] border border-white/15 bg-[#080808] p-6 text-white sm:p-8">
      <div className="echo-pending-pulse rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-black text-white/55 w-fit">
        CERTIFICATE PENDING
      </div>
      <p className="echo-hand-float mt-8 font-hand text-3xl text-[#f59abd]" style={{ animationDelay: "0.5s" }}>
        no seal yet
      </p>
      <h2 className="mt-4 max-w-3xl font-display text-[clamp(3rem,7vw,7rem)] font-black leading-[0.86]">
        Certificate appears only after a clean Network transaction.
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-7 text-white/62">
        Echo will show the commitment hash, registry reference, track ID, Sepolia transaction, and timestamp after the CRE/backend writes a confirmed CLEAN seal.
      </p>
      {flow?.status === "pipeline_completed" ? (
        <p className="mt-6 rounded-[8px] border border-[#9ef7c9]/25 bg-[#9ef7c9]/10 p-4 text-sm font-bold text-[#9ef7c9]">
          {flow.registryTxHash && flow.registryTrackId
            ? "Network seal confirmed on Sepolia."
            : "Verdict CLEAN reçu — attente de la confirmation TrackSealed du CRE."}
        </p>
      ) : null}
    </div>
  );
}

export function SealCertificate(props: SealCertificateProps) {
  if (props.flow?.status === "pipeline_blocked") {
    return <BlockedCard report={props.report} publicReferences={props.publicReferences} blockedStepReason={props.blockedStepReason} />;
  }

  if (props.hasRegistrySeal) {
    return <SealedCard flow={props.flow} trackId={props.trackId} txHash={props.txHash} />;
  }

  return <PendingCard flow={props.flow} />;
}
