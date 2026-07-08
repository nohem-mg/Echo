import { echoConfig, isWorldConfigured } from "@/lib/config";
import { fmtScore, getBestMatch } from "@/lib/flow/report";
import type { EchoFlow, EchoPayment, EchoPipelineStep, EchoReport, WorldVerification } from "@/lib/types";

type FlowStatusInput = {
  progressStatus: string;
  flow: EchoFlow | null;
  pipelineStarted: boolean;
  payment: EchoPayment;
  verification: WorldVerification;
  audioName: string;
  trackFingerprint: string;
};

/** One-line human-readable status for the console card, in priority order. */
export function getFlowStatusMessage({
  progressStatus,
  flow,
  pipelineStarted,
  payment,
  verification,
  audioName,
  trackFingerprint,
}: FlowStatusInput): string {
  if (progressStatus) {
    return progressStatus;
  }

  if (flow?.status === "pipeline_completed") {
    if (flow.registryTxHash) {
      return `Pipeline CLEAN. Registry seal confirmed · ${flow.registryTxHash.slice(0, 12)}...`;
    }

    return "Pipeline CLEAN. Waiting for the CRE Network transaction.";
  }

  if (flow?.status === "pipeline_blocked") {
    return "Pipeline stopped. No on-chain seal was created.";
  }

  if (flow?.status === "error") {
    return `Pipeline failed: ${flow.error ?? "unknown error"}`;
  }

  if (pipelineStarted) {
    return "Confidential analysis pipeline running...";
  }

  if (payment.status === "paid") {
    return `Fee paid · ${payment.hash.slice(0, 12)}... Upload and start analysis when ready.`;
  }

  if (payment.status === "pending") {
    if (payment.hash) {
      return `Waiting for Sepolia confirmation · ${payment.hash.slice(0, 12)}...`;
    }

    return "Waiting for wallet signature";
  }

  if (verification.status === "verified") {
    return `World ID verified ${verification.mode === "mock" ? "in demo mode" : "with proof"}`;
  }

  if (verification.status === "pending") {
    return "Waiting for World ID proof";
  }

  if (!audioName) {
    return "Drop a track to start the seal flow";
  }

  if (!trackFingerprint) {
    return "Computing local audio fingerprint";
  }

  if (isWorldConfigured()) {
    return "Verify World ID before payment";
  }

  return echoConfig.mockWorldEnabled ? "Demo mode enabled" : "World Developer Portal credentials required";
}

export type VerdictInfo = {
  title: string;
  subtitle: string;
  badgeText: string;
  badgeClass: string;
  colorClass: string;
  showMatches: boolean;
  bestMatch: number;
};

type VerdictInput = {
  flow: EchoFlow | null;
  pipelineStarted: boolean;
  livePipelineSteps: EchoPipelineStep[];
  activeReport?: EchoReport;
  hasRegistrySeal: boolean;
};

/** Copy, badge, and palette for the verdict board, derived from flow state. */
export function getVerdictInfo({
  flow,
  pipelineStarted,
  livePipelineSteps,
  activeReport,
  hasRegistrySeal,
}: VerdictInput): VerdictInfo {
  if (!pipelineStarted || !flow) {
    return {
      title: "No active verification",
      subtitle: "Start analysis to see results",
      badgeText: "Awaiting input",
      badgeClass: "border-white/20 bg-white/5 text-white/60",
      colorClass: "text-white/60",
      showMatches: false,
      bestMatch: 0,
    };
  }

  const isPlagiarism = livePipelineSteps.some((s) => s.stepKey === "02A" && s.status === "blocked");
  const isSimilar = livePipelineSteps.some((s) => s.stepKey === "02B" && s.status === "blocked");
  const reportVerdict = activeReport?.verdict;
  const bestMatch = getBestMatch(activeReport);

  if (flow.status === "pipeline_blocked" || isPlagiarism || isSimilar || reportVerdict === "SIMILAR" || reportVerdict === "REJECTED") {
    if (isPlagiarism || reportVerdict === "REJECTED") {
      return {
        title: "REJECTED: Plagiarism",
        subtitle: "ACRCloud acoustic fingerprint match exceeds the 95% threshold.",
        badgeText: "STOP - REJECTED",
        badgeClass: "border-[#ff7777]/60 bg-[#ff7777]/10 text-[#ff7777]",
        colorClass: "text-[#ff7777]",
        showMatches: Boolean(activeReport?.similar_tracks?.length),
        bestMatch,
      };
    }
    return {
      title: "SIMILARITY DETECTED",
      subtitle: "Compositional MIDI similarity exceeds the 75% private registry threshold.",
      badgeText: "STOP - SIMILAR",
      badgeClass: "border-[#ffd166]/60 bg-[#ffd166]/10 text-[#ffd166]",
      colorClass: "text-[#ffd166]",
      showMatches: Boolean(activeReport?.similar_tracks?.length),
      bestMatch,
    };
  }

  if (flow.status === "pipeline_completed") {
    return {
      title: "CLEAN",
      subtitle: hasRegistrySeal
        ? "The track has been sealed on Ethereum Sepolia."
        : "The track passed analysis. Waiting for the Network transaction.",
      badgeText: hasRegistrySeal ? "SEALED" : "CLEAN - AWAITING SEAL",
      badgeClass: "border-[#9ef7c9]/60 bg-[#9ef7c9]/10 text-[#9ef7c9]",
      colorClass: "text-[#9ef7c9]",
      showMatches: Boolean(activeReport),
      bestMatch,
    };
  }

  if (flow.status === "error") {
    return {
      title: "VERIFICATION ERROR",
      subtitle: flow.error || "The pipeline run failed due to a system error.",
      badgeText: "FAILED",
      badgeClass: "border-[#ff7777]/60 bg-[#ff7777]/10 text-[#ff7777]",
      colorClass: "text-[#ff7777]",
      showMatches: false,
      bestMatch: 0,
    };
  }

  return {
    title: "ANALYZING...",
    subtitle: "confidential Intel TEE check running.",
    badgeText: "PROCESSING",
    badgeClass: "border-[#fff7cf]/60 bg-[#fff7cf]/10 text-[#fff7cf]",
    colorClass: "text-[#fff7cf]",
    showMatches: false,
    bestMatch: 0,
  };
}

export function formatVerdictBadge(verdict: VerdictInfo): string {
  return verdict.bestMatch > 0
    ? `${verdict.badgeText} · Best match ${fmtScore(verdict.bestMatch)}%`
    : verdict.badgeText;
}
