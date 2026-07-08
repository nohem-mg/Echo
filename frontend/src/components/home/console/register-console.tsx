"use client";

import { Copy, ExternalLink, Fingerprint, Pause, Play } from "lucide-react";
import { FlowHistoryPanel } from "@/components/home/console/flow-history-panel";
import { PipelineStepList } from "@/components/home/console/pipeline-step-list";
import { UploadDropzone } from "@/components/home/console/upload-dropzone";
import { WalletConnectControl } from "@/components/common/wallet-connect-control";
import type { DisplayStep } from "@/lib/flow/pipeline-display";
import type { EchoFlow, EchoPayment, WorldVerification } from "@/lib/types";
import type { HistoryEntry } from "@/lib/hooks/use-flow-history";

type RegisterConsoleProps = {
  isConnected: boolean;
  historyEntries: HistoryEntry[];
  onRestoreFlow: (flowId: string) => void;
  audioFile: File | null;
  audioName: string;
  trackFingerprint: string;
  onAudioFile: (file: File) => void | Promise<void>;
  isPlaying: boolean;
  onTogglePreview: () => void;
  verification: WorldVerification;
  canVerify: boolean;
  onVerifyWorld: () => void;
  payment: EchoPayment;
  canPay: boolean;
  canStartAnalysis: boolean;
  isStartingPipeline: boolean;
  pipelineStarted: boolean;
  flow: EchoFlow | null;
  onPrimaryAction: () => void;
  flowStatus: string;
  displaySteps: DisplayStep[];
  hasLiveSteps: boolean;
};

function verifyButtonLabel({ verification, audioName, trackFingerprint }: Pick<RegisterConsoleProps, "verification" | "audioName" | "trackFingerprint">) {
  if (verification.status === "verified") return "World ID OK";
  if (verification.status === "pending") return "Verifying...";
  if (audioName && !trackFingerprint) return "Hashing...";
  if (audioName) return "Verify World ID";
  return "Add track first";
}

function primaryButtonLabel({ payment, isStartingPipeline, pipelineStarted, flow }: Pick<RegisterConsoleProps, "payment" | "isStartingPipeline" | "pipelineStarted" | "flow">) {
  if (payment.status !== "paid") return "Start process";
  if (isStartingPipeline) return "Starting...";
  if (flow?.status === "pipeline_completed") return "Analysis complete";
  if (flow?.status === "pipeline_blocked" || flow?.status === "error") return "Analysis stopped";
  if (pipelineStarted) return "Analysis running";
  return "Upload / Start analysis";
}

function FlowStatusCard({
  flow,
  flowStatus,
  verification,
  payment,
}: Pick<RegisterConsoleProps, "flow" | "flowStatus" | "verification" | "payment">) {
  return (
    <div className="mt-4 rounded-[8px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
      <span className="font-bold text-white/80">Flow status:</span> {flowStatus}
      {flow ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <span className="font-bold text-white/80">Flow ID:</span>
          <code className="max-w-full truncate rounded-full border border-white/10 bg-black/30 px-3 py-1 font-mono text-xs text-[#9ef7c9]">{flow.id}</code>
          <button
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-bold text-white/70 transition hover:border-[#f59abd] hover:text-[#f59abd]"
            onClick={() => void navigator.clipboard.writeText(flow.id)}
            type="button"
          >
            <Copy className="size-3.5" aria-hidden="true" />
            Copy
          </button>
          <a
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-bold text-white/70 transition hover:border-[#8fd5ff] hover:text-[#8fd5ff]"
            href={`/api/flows/${flow.id}`}
            rel="noreferrer"
            target="_blank"
          >
            API
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      ) : null}
      {verification.status === "error" ? <span className="mt-1 block text-[#ff7777]">{verification.error}</span> : null}
      {payment.status === "error" ? <span className="mt-1 block text-[#ff7777]">{payment.error}</span> : null}
    </div>
  );
}

export function RegisterConsole(props: RegisterConsoleProps) {
  const {
    isConnected,
    historyEntries,
    onRestoreFlow,
    audioFile,
    audioName,
    onAudioFile,
    isPlaying,
    onTogglePreview,
    canVerify,
    onVerifyWorld,
    payment,
    canPay,
    canStartAnalysis,
    isStartingPipeline,
    pipelineStarted,
    flow,
    onPrimaryAction,
    displaySteps,
    hasLiveSteps,
  } = props;

  return (
    <div className="order-1 relative rounded-[8px] border border-white/15 bg-[#0a0a0a] p-4 sm:p-6 lg:order-2 lg:p-8">
      <div className="echo-badge-tilt absolute -right-4 -top-5 rotate-3 rounded-[8px] border border-[#f59abd] bg-[#050505] px-4 py-2 font-hand text-xl text-[#f59abd]">
        artist mode
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase text-white/45">MVP console</p>
          <h2 className="mt-1 font-display text-3xl font-black">Register a track</h2>
        </div>
        <button
          className={`inline-flex h-12 items-center gap-2 rounded-full border border-white/15 px-5 font-bold transition ${audioFile ? "hover:border-[#f59abd] hover:text-[#f59abd]" : "cursor-not-allowed opacity-40"}`}
          disabled={!audioFile}
          onClick={onTogglePreview}
          title={audioFile ? "Play uploaded track" : "Upload a track to preview"}
          type="button"
        >
          {isPlaying ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          Preview
        </button>
      </div>

      {isConnected && <FlowHistoryPanel entries={historyEntries} onRestore={onRestoreFlow} />}

      <UploadDropzone audioName={audioName} onFile={onAudioFile} />

      <div className="mt-5 grid gap-3 xl:grid-cols-3">
        <button
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#fff7cf] px-5 font-black text-[#050505] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canVerify}
          onClick={onVerifyWorld}
          type="button"
        >
          <Fingerprint className="size-5" aria-hidden="true" />
          {verifyButtonLabel(props)}
        </button>
        <WalletConnectControl tone="panel" />
        <button
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#f59abd] px-5 font-black text-[#050505] transition hover:bg-[#ffb1ce] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={payment.status === "paid" ? !canStartAnalysis || isStartingPipeline : !canPay}
          onClick={onPrimaryAction}
          type="button"
        >
          {primaryButtonLabel({ payment, isStartingPipeline, pipelineStarted, flow })}
        </button>
      </div>

      <FlowStatusCard flow={flow} flowStatus={props.flowStatus} verification={props.verification} payment={payment} />

      <PipelineStepList steps={displaySteps} hasLiveSteps={hasLiveSteps} pipelineStarted={pipelineStarted} />
    </div>
  );
}
