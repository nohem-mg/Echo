"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { IDKit, orbLegacy, type IDKitResult } from "@worldcoin/idkit-core";
import Image from "next/image";
import QRCode from "qrcode";
import {
  ArrowUpRight,
  Check,
  CircleDot,
  Copy,
  Disc3,
  ExternalLink,
  FileAudio,
  Fingerprint,
  LockKeyhole,
  Pause,
  Play,
  QrCode as QrCodeIcon,
  Radio,
  Sparkles,
  Upload,
  WalletCards,
  Waves,
  X,
} from "lucide-react";
import { isAddress, parseEther, toHex, type Abi } from "viem";
import { useAccount, useChainId, usePublicClient, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { echoConfig, isWorldConfigured } from "@/lib/config";
import {
  buildFlowCommitmentHash,
  buildFlowRegistryRef,
  findRegistryTrackIdByCommitment,
  isTrackRegisteredOnChain,
  parseTrackRegisteredTrackId,
  worldNullifierToBigInt,
} from "@/lib/registry-handoff";
import type { EchoFlow, EchoPayment, EchoPipelineStep, EchoReport, EchoSimilarTrack, PaymentCreateResponse, TrackUploadResponse, WorldVerification } from "@/lib/types";
import registryAbi from "@/lib/abi/Registry.json";

const registryContractAbi = registryAbi.abi as Abi;

type StepState = "idle" | "active" | "done" | "blocked";

type DisplayStep = {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  status?: string;
  reason?: string;
};

type WorldQrState = {
  connectorURI: string;
  imageDataUrl: string;
};

type ReportTableMatch = EchoSimilarTrack & {
  keyLabel: string;
};

const pipelineSteps = [
  {
    id: "01",
    title: "Audio to MIDI",
    detail: "BasicPitch profile",
    meta: "00:18",
  },
  {
    id: "02A",
    title: "Public fingerprint",
    detail: "ACRCloud sweep",
    meta: "41% match",
  },
  {
    id: "02B",
    title: "Private registry",
    detail: "Encrypted MIDI registry scan",
    meta: "12% match",
  },
  {
    id: "03",
    title: "Commercial deltas",
    detail: "ISRC to preview",
    meta: "3 candidates",
  },
  {
    id: "04",
    title: "Final report",
    detail: "TEE attested verdict",
    meta: "CLEAN",
  },
];

const sponsors = ["World ID", "RainbowKit", "ETH Sepolia", "Chainlink CRE", "Confidential AI", "Unlink", "Walrus"];

const mockReports: Record<"CLEAN" | "SIMILAR" | "REJECTED", EchoReport> = {
  CLEAN: {
    verdict: "CLEAN",
    submitted_track: {
      key: "A",
      mode: "min",
      BPM: 124,
      fingerprint: "mock-clean-fingerprint",
    },
    similar_tracks: [
      {
        rank: 1,
        title: "Night Glass - Luma Vale",
        score: 21,
        melody: 18,
        rhythm: 24,
        structure: 20,
        key: "A min",
        BPM: 124,
        source: "ACRCloud",
      },
      {
        rank: 2,
        title: "@artist_9x7 - [SEALED]",
        score: 14,
        melody: 16,
        rhythm: 12,
        structure: 15,
        key: "C maj",
        BPM: 121,
        source: "Private registry",
      },
    ],
    ai_summary: "Mock mode: no significant similarity crossed the 75% threshold.",
  },
  SIMILAR: {
    verdict: "SIMILAR",
    similar_tracks: [
      {
        rank: 1,
        title: "Similar Composition - Sealed #39a5",
        score: 82,
        melody: 85,
        rhythm: 78,
        structure: 83,
        key: "A min",
        BPM: 124,
        source: "Private registry",
      },
    ],
    ai_summary: "Mock mode: a private registry composition crossed the similarity threshold.",
  },
  REJECTED: {
    verdict: "REJECTED",
    similar_tracks: [
      {
        rank: 1,
        title: "Matched Public Track (ACRCloud)",
        score: 97,
        melody: 92,
        rhythm: 98,
        structure: 90,
        key: "G min",
        BPM: 128,
        source: "ACRCloud (ISRC: US-RC1-23-45678)",
      },
    ],
    ai_summary: "Mock mode: an acoustic fingerprint match crossed the 95% rejection threshold.",
  },
};

function scoreTone(score: number) {
  if (score >= 75) {
    return "text-[#ff7777]";
  }

  if (score >= 50) {
    return "text-[#ffd166]";
  }

  return "text-[#9ef7c9]";
}

function createMockProof(action: string): IDKitResult {
  return {
    protocol_version: "3.0",
    nonce: `mock-${crypto.randomUUID()}`,
    action,
    environment: "staging",
    user_presence_completed: true,
    responses: [
      {
        identifier: "orb",
        signal_hash: "0xmock_signal",
        proof: "0xmock_proof",
        merkle_root: "0xmock_root",
        nullifier: `0x${crypto.randomUUID().replaceAll("-", "")}`,
      },
    ],
  };
}

function getProofNullifier(result: IDKitResult) {
  const firstResponse = result.responses[0];

  if (!firstResponse) {
    return "";
  }

  if ("nullifier" in firstResponse) {
    return firstResponse.nullifier;
  }

  if ("session_nullifier" in firstResponse) {
    return firstResponse.session_nullifier[0] ?? "";
  }

  return "";
}

async function createAudioFingerprint(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hash}`;
}

function normalizeReportMatches(report?: EchoReport): ReportTableMatch[] {
  if (!report?.similar_tracks?.length) {
    return [];
  }

  return report.similar_tracks.map((match) => ({
    ...match,
    keyLabel: typeof match.BPM === "number" ? `${match.key} / ${match.BPM}` : match.key,
  }));
}

function getBestMatch(report?: EchoReport) {
  return report?.similar_tracks?.reduce((max, match) => Math.max(max, match.score), 0) ?? 0;
}

function buildFallbackBlockedReport(flow: EchoFlow | null, steps: EchoPipelineStep[]): EchoReport | undefined {
  if (!flow || flow.status !== "pipeline_blocked") {
    return undefined;
  }

  const blocked2a = steps.find((step) => step.stepKey === "02A" && step.status === "blocked");
  const blocked2b = steps.find((step) => step.stepKey === "02B" && step.status === "blocked");
  const blockedStep = blocked2a ?? blocked2b;
  if (!blockedStep) {
    return undefined;
  }

  const scoreMatch = blockedStep.meta?.match(/(\d+)%/) ?? blockedStep.reason?.match(/(\d+)%/);
  const score = scoreMatch ? Number(scoreMatch[1]) : 0;
  const isPlagiarism = blockedStep.stepKey === "02A";

  return {
    verdict: isPlagiarism ? "REJECTED" : "SIMILAR",
    similar_tracks: [
      {
        rank: 1,
        title: blockedStep.reason ?? (isPlagiarism ? "Correspondance ACRCloud" : "Similarité registre privé"),
        source: isPlagiarism ? "ACRCloud" : "Registre privé",
        score,
        melody: score,
        rhythm: score,
        structure: score,
        key: isPlagiarism ? "—" : blockedStep.reason?.slice(0, 12) ?? "—",
      },
    ],
    ai_summary: blockedStep.reason ?? flow.error ?? "Analyse interrompue — aucun seal on-chain.",
  };
}

function toBytes32Hex(value: string) {
  let hexValue = value;

  if (hexValue.startsWith("sha256:")) {
    hexValue = `0x${hexValue.slice(7)}`;
  } else if (!hexValue.startsWith("0x")) {
    hexValue = toHex(hexValue);
  }

  return hexValue.padEnd(66, "0").slice(0, 66) as `0x${string}`;
}

export default function Home() {
  const [audioName, setAudioName] = useState("");
  const [trackFingerprint, setTrackFingerprint] = useState("");
  const [flow, setFlow] = useState<EchoFlow | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [verification, setVerification] = useState<WorldVerification>({ status: "idle" });
  const [payment, setPayment] = useState<EchoPayment>({ status: "idle" });
  const [pendingQuote, setPendingQuote] = useState<PaymentCreateResponse | null>(null);
  const [pipelineStarted, setPipelineStarted] = useState(false);
  const [worldQr, setWorldQr] = useState<WorldQrState | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [livePipelineSteps, setLivePipelineSteps] = useState<EchoPipelineStep[]>([]);
  const [pipelineProgressStatus, setPipelineProgressStatus] = useState("");
  const [isStartingPipeline, setIsStartingPipeline] = useState(false);
  const [creDisabled, setCreDisabled] = useState(false);
  const [isSealingOnChain, setIsSealingOnChain] = useState(false);
  const sealAttemptedRef = useRef<string | null>(null);
  const sealInFlightRef = useRef<string | null>(null);
  const { writeContractAsync: writeRegistryContract, isPending: isWritingRegistry } = useWriteContract();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { sendTransactionAsync, isPending: isSendingTransaction } = useSendTransaction();

  const pendingPaymentHash = payment.status === "pending" ? payment.hash : undefined;
  const pendingPaymentReference = payment.status === "pending" ? payment.reference : undefined;
  const {
    data: paymentReceipt,
    error: paymentReceiptError,
    isLoading: isConfirmingTransaction,
  } = useWaitForTransactionReceipt({
    hash: pendingPaymentHash,
    chainId: sepolia.id,
    query: {
      enabled: Boolean(pendingPaymentHash),
    },
  });

  const selectedLabel = useMemo(() => {
    if (audioName) {
      return audioName;
    }

    return "Drop WAV / MP3";
  }, [audioName]);

  const canVerify = Boolean(audioName && trackFingerprint && verification.status !== "pending");
  const canPay = Boolean(audioName && verification.status === "verified" && verification.flow.id && payment.status !== "pending" && payment.status !== "paid");
  const canStartAnalysis = Boolean(payment.status === "paid" && flow?.id && audioFile && !pipelineStarted && !isStartingPipeline);
  const shouldUseMockReport = Boolean(echoConfig.mockWorldEnabled && flow?.worldMode === "mock");
  const activeReport = flow?.report ?? buildFallbackBlockedReport(flow, livePipelineSteps) ?? (shouldUseMockReport && flow?.status === "pipeline_completed" ? mockReports.CLEAN : undefined);
  const reportMatches = useMemo(() => normalizeReportMatches(activeReport), [activeReport]);
  const bestReportMatch = getBestMatch(activeReport);
  const hasRegistrySeal = Boolean(flow?.status === "pipeline_completed" && flow.registryTxHash);
  const certificateTrackId = flow?.registryTrackId;
  const certificateTxHash = flow?.registryTxHash;
  const flowStatus = useMemo(() => {
    if (pipelineProgressStatus) {
      return pipelineProgressStatus;
    }

    if (flow?.status === "pipeline_completed") {
      if (flow.registryTxHash) {
        return `Pipeline CLEAN. Registry seal confirmed · ${flow.registryTxHash.slice(0, 12)}...`;
      }

      return "Pipeline CLEAN. Waiting for the CRE Registry transaction.";
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
  }, [audioName, flow, payment, pipelineProgressStatus, pipelineStarted, trackFingerprint, verification]);

  useEffect(() => {
    if (payment.status !== "pending" || !paymentReceiptError) {
      return;
    }

    const receiptErrorMessage = paymentReceiptError.message;
    let cancelled = false;

    async function markReceiptError() {
      await Promise.resolve();

      if (cancelled) {
        return;
      }

      setPayment({
        status: "error",
        error: receiptErrorMessage,
        reference: payment.reference,
        hash: payment.hash,
      });
    }

    markReceiptError();

    return () => {
      cancelled = true;
    };
  }, [payment.hash, payment.reference, payment.status, paymentReceiptError]);

  useEffect(() => {
    if (!paymentReceipt || !pendingQuote || !pendingPaymentHash || !pendingPaymentReference || payment.status !== "pending") {
      return;
    }

    const txHash = pendingPaymentHash;
    const paymentReference = pendingPaymentReference;
    const quoteReference = pendingQuote.reference;
    const quoteFlowId = pendingQuote.flowId;
    const receiptBlockNumber = paymentReceipt.blockNumber.toString();
    let cancelled = false;

    async function confirmPayment() {
      try {
        const confirmResponse = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            flowId: quoteFlowId,
            hash: txHash,
            reference: paymentReference,
            expectedFrom: address,
          }),
        });

        if (!confirmResponse.ok) {
          throw new Error("Sepolia payment was not confirmed");
        }

        const confirmed = (await confirmResponse.json()) as {
          flow?: EchoFlow;
          transaction?: {
            blockNumber?: string;
          };
        };

        if (cancelled) {
          return;
        }

        if (confirmed.flow) {
          setFlow(confirmed.flow);
        }

        setPayment({
          status: "paid",
          reference: quoteReference,
          hash: txHash,
          mode: "evm",
          blockNumber: confirmed.transaction?.blockNumber ?? receiptBlockNumber,
        });
        setPendingQuote(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPayment({
          status: "error",
          error: error instanceof Error ? error.message : "Sepolia payment confirmation failed",
          reference: paymentReference,
          hash: txHash,
        });
      }
    }

    confirmPayment();

    return () => {
      cancelled = true;
    };
  }, [address, payment.status, paymentReceipt, pendingPaymentHash, pendingPaymentReference, pendingQuote]);

  // Live polling for pipeline status when a CRE trigger is active.
  useEffect(() => {
    if (!pipelineStarted || !flow?.id || creDisabled) {
      return;
    }

    const flowId = flow.id;
    let cancelled = false;

    async function pollStatus() {
      try {
        const response = await fetch(`/api/pipeline/status?flowId=${flowId}`);
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (cancelled) {
          return;
        }

        if (data.flow) {
          setFlow(data.flow);
        }
        if (data.pipeline) {
          setLivePipelineSteps(data.pipeline);
        }

        if (data.flow?.status === "pipeline_completed") {
          setPipelineProgressStatus(
            data.flow.registryTxHash
              ? "Pipeline completed: Registry seal confirmed on Sepolia"
              : data.flow.report?.verdict === "CLEAN" && echoConfig.registryAddress
                ? "Verdict CLEAN — inscription on-chain en cours..."
                : "Pipeline completed: final report received",
          );
        } else if (data.flow?.status === "pipeline_blocked") {
          setPipelineProgressStatus("Pipeline stopped: no on-chain seal was created");
        } else if (data.flow?.status === "error") {
          setPipelineProgressStatus(`Pipeline failed: ${data.flow.error || "unknown error"}`);
        }

        const terminalStatuses: string[] = ["pipeline_completed", "pipeline_blocked", "error"];
        const awaitingRegistrySeal =
          data.flow?.status === "pipeline_completed" &&
          !data.flow.registryTxHash &&
          data.flow.report?.verdict === "CLEAN" &&
          Boolean(echoConfig.registryAddress);

        if (data.flow && terminalStatuses.includes(data.flow.status) && !awaitingRegistrySeal) {
          clearInterval(intervalId);
        }
      } catch (error) {
        console.error("Error polling pipeline status:", error);
      }
    }

    const intervalId = setInterval(pollStatus, 3000);
    pollStatus();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [creDisabled, pipelineStarted, flow?.id]);

  // After CLEAN analysis: registerTrack (wallet) then CRE onReport seal.
  useEffect(() => {
    if (!flow?.id || flow.status !== "pipeline_completed") {
      return;
    }
    if (flow.registryTxHash || flow.report?.verdict !== "CLEAN") {
      return;
    }
    if (!echoConfig.registryAddress || creDisabled) {
      return;
    }

    const flowId = flow.id;
    const needsRegisterTrack = !flow.registryTrackId;
    const sealAttemptKey = needsRegisterTrack ? `${flowId}:register+seal` : `${flowId}:seal`;
    if (sealAttemptedRef.current === sealAttemptKey) {
      return;
    }
    if (sealInFlightRef.current === flowId) {
      return;
    }

    sealAttemptedRef.current = sealAttemptKey;
    sealInFlightRef.current = flowId;
    setIsSealingOnChain(true);

    void (async () => {
      try {
        const statusResponse = await fetch(`/api/pipeline/status?flowId=${flowId}`);
        if (!statusResponse.ok) {
          throw new Error(`Failed to load flow status (HTTP ${statusResponse.status})`);
        }

        const statusData = (await statusResponse.json()) as {
          flow?: EchoFlow;
          track?: { id?: string };
        };
        const uploadTrackId = statusData.track?.id;
        if (!uploadTrackId) {
          throw new Error("Track not found for on-chain seal");
        }

        let activeFlow = statusData.flow ?? flow;

        if (!activeFlow.registryTrackId) {
          setPipelineProgressStatus("Verdict CLEAN — signature registerTrack sur Sepolia...");
          activeFlow = await registerTrackOnChain(activeFlow, uploadTrackId);
          setFlow(activeFlow);
          if (!activeFlow.registryTrackId) {
            throw new Error("registerTrack did not return a registry track ID");
          }
          sealAttemptedRef.current = `${flowId}:seal`;
        }

        setPipelineProgressStatus("CRE seal callback on Sepolia...");
        const sealResponse = await fetch("/api/pipeline/seal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flowId }),
        });

        if (!sealResponse.ok) {
          const errorBody = await readApiErrorBody(sealResponse);
          throw new Error(formatApiError(errorBody, `Failed to seal on-chain (HTTP ${sealResponse.status})`));
        }

        const sealData = (await sealResponse.json()) as {
          creSeal?: { status: string; error?: string; reason?: string };
        };

        if (sealData.creSeal?.status === "failed") {
          throw new Error(sealData.creSeal.error ?? "CRE seal trigger failed");
        }
        if (sealData.creSeal?.status === "disabled") {
          throw new Error(sealData.creSeal.reason ?? "CRE seal trigger disabled");
        }
      } catch (error) {
        sealAttemptedRef.current = null;
        setPipelineProgressStatus(
          `On-chain seal failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        if (sealInFlightRef.current === flowId) {
          sealInFlightRef.current = null;
        }
        setIsSealingOnChain(false);
      }
    })();
  }, [
    creDisabled,
    flow?.id,
    flow?.registryTrackId,
    flow?.registryTxHash,
    flow?.report?.verdict,
    flow?.status,
  ]);

  // Local simulation fallback when the CRE trigger is disabled.
  useEffect(() => {
    if (!pipelineStarted || !flow || !creDisabled || livePipelineSteps.length === 0) {
      return;
    }

    const isTerminal = ["pipeline_completed", "pipeline_blocked", "error"].includes(flow.status);
    if (isTerminal) {
      return;
    }

    const lowerName = audioName.toLowerCase();
    const isPlagiat = lowerName.includes("plagiat") || lowerName.includes("public");
    const isSimilar = lowerName.includes("similar") || lowerName.includes("private");

    let timer: NodeJS.Timeout | undefined;

    const step01 = livePipelineSteps.find(s => s.stepKey === "01");
    const step02A = livePipelineSteps.find(s => s.stepKey === "02A");
    const step02B = livePipelineSteps.find(s => s.stepKey === "02B");
    const step03 = livePipelineSteps.find(s => s.stepKey === "03");
    const step04 = livePipelineSteps.find(s => s.stepKey === "04");

    if (step01 && step01.status === "running") {
      timer = setTimeout(() => {
        setLivePipelineSteps(prev => prev.map(s => {
          if (s.stepKey === "01") {
            return { ...s, status: "done", progress: 100, meta: "MIDI generated" };
          }
          if (s.stepKey === "02A" || s.stepKey === "02B") {
            return { ...s, status: "running", progress: 20 };
          }
          return s;
        }));
        setPipelineProgressStatus("BasicPitch conversion complete. Running parallel similarity sweeps...");
      }, 2500);
    } else if (step02A && step02A.status === "running" && step02B && step02B.status === "running") {
      timer = setTimeout(() => {
        if (isPlagiat) {
          setLivePipelineSteps(prev => prev.map(s => {
            if (s.stepKey === "02A") {
              return { ...s, status: "blocked", progress: 95, meta: "Match: 97%", reason: "Plagiarism detected (ACRCloud: 97%)" };
            }
            if (s.stepKey === "02B") {
              return { ...s, status: "queued", progress: 0 };
            }
            return s;
          }));
          setFlow(prev => prev ? { ...prev, status: "pipeline_blocked", report: mockReports.REJECTED } : null);
          setPipelineProgressStatus("STOP: Plagiarism detected. No on-chain seal was created.");
        } else if (isSimilar) {
          setLivePipelineSteps(prev => prev.map(s => {
            if (s.stepKey === "02A") {
              return { ...s, status: "done", progress: 100, meta: "Match: 14%" };
            }
            if (s.stepKey === "02B") {
              return { ...s, status: "blocked", progress: 85, meta: "Match: 82%", reason: "Composition similarity detected (Algo MIDI: 82%)" };
            }
            return s;
          }));
          setFlow(prev => prev ? { ...prev, status: "pipeline_blocked", report: mockReports.SIMILAR } : null);
          setPipelineProgressStatus("STOP: Composition similarity detected. No on-chain seal was created.");
        } else {
          setLivePipelineSteps(prev => prev.map(s => {
            if (s.stepKey === "02A") {
              return { ...s, status: "done", progress: 100, meta: "Match: 8%" };
            }
            if (s.stepKey === "02B") {
              return { ...s, status: "done", progress: 100, meta: "Match: 21%" };
            }
            if (s.stepKey === "03") {
              return { ...s, status: "running", progress: 10 };
            }
            return s;
          }));
          setPipelineProgressStatus("Sweeps passed. Checking commercial preview deltas...");
        }
      }, 3000);
    } else if (step03 && step03.status === "running") {
      timer = setTimeout(() => {
        setLivePipelineSteps(prev => prev.map(s => {
          if (s.stepKey === "03") {
            return { ...s, status: "done", progress: 100, meta: "3 sources clean" };
          }
          if (s.stepKey === "04") {
            return { ...s, status: "running", progress: 10 };
          }
          return s;
        }));
        setPipelineProgressStatus("Commercial check passed. Generating attested Intel TDX report...");
      }, 2500);
    } else if (step04 && step04.status === "running") {
      timer = setTimeout(() => {
        setLivePipelineSteps(prev => prev.map(s => {
          if (s.stepKey === "04") {
            return { ...s, status: "done", progress: 100, meta: "CLEAN" };
          }
          return s;
        }));
        setFlow(prev =>
          prev
            ? {
                ...prev,
                status: "pipeline_completed",
                commitmentHash: toBytes32Hex(trackFingerprint || prev.trackFingerprint),
                registryRef: toBytes32Hex(prev.id),
                registryTrackId: toBytes32Hex(`mock-track-${prev.id}`),
                registryTxHash: `0x${"1".repeat(64)}`,
                report: mockReports.CLEAN,
              }
            : null,
        );
        setPipelineProgressStatus("Mock pipeline complete. Demo Registry seal available.");
      }, 2500);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [pipelineStarted, flow, livePipelineSteps, audioName, trackFingerprint, creDisabled]);

  async function handleAudioFile(file: File) {
    setAudioFile(file);
    setAudioName(file.name);
    setTrackFingerprint("");
    setFlow(null);
    setVerification({ status: "idle" });
    setPipelineStarted(false);
    setPayment({ status: "idle" });
    setPendingQuote(null);
    setLivePipelineSteps([]);
    setPipelineProgressStatus("");
    setIsStartingPipeline(false);
    setCreDisabled(false);

    try {
      setTrackFingerprint(await createAudioFingerprint(file));
    } catch {
      setVerification({
        status: "error",
        error: "Could not compute local track fingerprint",
      });
    }
  }

  async function handleAudioSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await handleAudioFile(file);
  }

  async function handleCopyFlowId() {
    if (!flow?.id) {
      return;
    }

    await navigator.clipboard.writeText(flow.id);
  }

  async function handleVerifyWorld() {
    setVerification({ status: "pending" });

    try {
      if (!isWorldConfigured()) {
        if (!echoConfig.mockWorldEnabled) {
          throw new Error("Missing NEXT_PUBLIC_WORLD_APP_ID or NEXT_PUBLIC_WORLD_RP_ID");
        }

        const mockProof = createMockProof(echoConfig.worldAction);
        const response = await fetch("/api/world/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rp_id: "rp_mock",
            idkitResponse: mockProof,
            track: {
              name: audioName,
              fingerprint: trackFingerprint,
            },
          }),
        });

        if (!response.ok) {
          throw new Error("Mock verification failed");
        }

        const verified = (await response.json()) as { flow?: EchoFlow };

        if (!verified.flow) {
          throw new Error("World ID passed, but flow persistence failed");
        }

        setFlowFromVerification(verified.flow);
        setVerification({
          status: "verified",
          proof: mockProof,
          nullifier: getProofNullifier(mockProof) || "0xmock_nullifier",
          mode: "mock",
          flow: verified.flow,
        });
        return;
      }

      const rpSignature = await fetch("/api/world/rp-signature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: echoConfig.worldAction }),
      }).then((response) => {
        if (!response.ok) {
          throw new Error("Could not create World ID request");
        }

        return response.json();
      });

      const request = await IDKit.requestWithInviteCode({
        app_id: echoConfig.worldAppId as `app_${string}`,
        action: echoConfig.worldAction,
        rp_context: {
          rp_id: echoConfig.worldRpId,
          nonce: rpSignature.nonce,
          created_at: rpSignature.created_at,
          expires_at: rpSignature.expires_at,
          signature: rpSignature.sig,
        },
        allow_legacy_proofs: true,
        environment: echoConfig.worldEnvironment,
      }).preset(orbLegacy({ signal: audioName || "echo-track" }));

      if (request.connectorURI) {
        const imageDataUrl = await QRCode.toDataURL(request.connectorURI, {
          width: 360,
          margin: 2,
          color: {
            dark: "#050505",
            light: "#fff7cf",
          },
        });

        setWorldQr({
          connectorURI: request.connectorURI,
          imageDataUrl,
        });
      }

      const proofResult = await request.pollUntilCompletion({ timeout: 180_000 });

      if (!proofResult.success) {
        throw new Error(`World ID failed: ${proofResult.error}`);
      }

      const verifyResponse = await fetch("/api/world/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rp_id: echoConfig.worldRpId,
          idkitResponse: proofResult.result,
          track: {
            name: audioName,
            fingerprint: trackFingerprint,
          },
        }),
      });

      if (!verifyResponse.ok) {
        const errorBody = await verifyResponse.json().catch(() => null);
        throw new Error(formatApiError(errorBody, "Backend rejected World ID proof"));
      }

      const verified = (await verifyResponse.json()) as { nullifier?: string; mode?: "world" | "mock"; flow?: EchoFlow };

      if (!verified.flow) {
        throw new Error("World ID passed, but flow persistence failed");
      }

      setFlowFromVerification(verified.flow);
      setVerification({
        status: "verified",
        proof: proofResult.result,
        nullifier: verified.nullifier ?? getProofNullifier(proofResult.result),
        mode: verified.mode ?? "world",
        flow: verified.flow,
      });
      setWorldQr(null);
    } catch (error) {
      setWorldQr(null);
      setVerification({
        status: "error",
        error: error instanceof Error ? error.message : "World ID verification failed",
      });
    }
  }

  async function handlePayAndStart() {
    console.log("[Echo] handlePayAndStart called", { audioName, verificationStatus: verification.status, paymentStatus: payment.status });
    if (!audioName || verification.status !== "verified" || payment.status === "pending" || payment.status === "paid") {
      console.log("[Echo] handlePayAndStart early return — guard failed");
      return;
    }

    // Mock the payment — skip the real Sepolia transaction entirely
    const mockHash = `0x${"ab".repeat(32)}` as `0x${string}`;
    const mockReference = `mock-ref-${crypto.randomUUID()}`;
    const flowId = verification.flow.id;
    console.log("[Echo] Mock payment starting, flowId:", flowId);

    try {
      // Still create the payment on the backend so the flow advances
      const paymentRequest = (await fetch("/api/payments/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowId }),
      }).then((response) => {
        console.log("[Echo] /api/payments/create response:", response.status);
        if (!response.ok) {
          throw new Error("Could not create payment request");
        }

        return response.json();
      })) as PaymentCreateResponse;

      console.log("[Echo] Payment created:", { flowId: paymentRequest.flowId, reference: paymentRequest.reference });

      if (paymentRequest.flow) {
        setFlow(paymentRequest.flow);
      }

      // Try to confirm the mock payment on the backend
      try {
        const confirmResponse = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            flowId: paymentRequest.flowId ?? flowId,
            hash: mockHash,
            reference: paymentRequest.reference ?? mockReference,
            expectedFrom: address ?? "0x0000000000000000000000000000000000000000",
          }),
        });

        console.log("[Echo] /api/payments/confirm response:", confirmResponse.status);

        if (confirmResponse.ok) {
          const confirmed = (await confirmResponse.json()) as { flow?: EchoFlow };
          if (confirmed.flow) {
            console.log("[Echo] Payment confirmed, flow status:", confirmed.flow.status);
            setFlow(confirmed.flow);
          }
        }
      } catch (confirmError) {
        console.warn("[Echo] Backend confirm failed:", confirmError);
      }

      setPayment({
        status: "paid",
        reference: paymentRequest.reference ?? mockReference,
        hash: mockHash,
        mode: "evm",
        blockNumber: "0",
      });
      setPendingQuote(null);
      console.log("[Echo] Payment marked as paid");
      if (audioFile) {
        void startPipelineForFlow(paymentRequest.flowId ?? flowId, audioFile);
      }
    } catch (payError) {
      console.warn("[Echo] payment/create failed, mocking anyway:", payError);
      setPayment({
        status: "paid",
        reference: mockReference,
        hash: mockHash,
        mode: "evm",
        blockNumber: "0",
      });
      setPendingQuote(null);
      if (audioFile) {
        void startPipelineForFlow(flowId, audioFile);
      }
    }
  }

  async function handlePrimaryAction() {
    console.log("[Echo] handlePrimaryAction called", { paymentStatus: payment.status });
    if (payment.status !== "paid") {
      await handlePayAndStart();
      return;
    }

    await handleUploadAndStart();
  }

  async function handleUploadAndStart() {
    console.log("[Echo] handleUploadAndStart called", { paymentStatus: payment.status, flowId: flow?.id, hasAudioFile: !!audioFile, pipelineStarted, isStartingPipeline });
    if (payment.status !== "paid" || !flow?.id || !audioFile || pipelineStarted || isStartingPipeline) {
      console.log("[Echo] handleUploadAndStart early return — guard failed");
      return;
    }

    await startPipelineForFlow(flow.id, audioFile);
  }

  async function ensureRegistryWalletReady() {
    if (!echoConfig.registryAddress) {
      return;
    }

    if (!isConnected || !address) {
      throw new Error("Connect your wallet on Sepolia before starting analysis.");
    }

    if (chainId !== echoConfig.registryChainId) {
      await switchChain({ chainId: sepolia.id });
    }
  }

  async function persistRegistryRegistration(
    flowId: string,
    registryTrackId: `0x${string}`,
    commitmentHash: `0x${string}`,
    registryRef: `0x${string}`,
  ) {
    const persistResponse = await fetch("/api/registry/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flowId,
        registryTrackId,
        commitmentHash,
        registryRef,
      }),
    });

    if (!persistResponse.ok) {
      const errorBody = await readApiErrorBody(persistResponse);
      throw new Error(formatApiError(errorBody, `Failed to persist Registry track ID (HTTP ${persistResponse.status})`));
    }

    const persisted = (await persistResponse.json()) as { flow?: EchoFlow };
    if (!persisted.flow) {
      throw new Error("Registry registration persisted without returning the updated flow.");
    }

    return persisted.flow;
  }

  async function registerTrackOnChain(currentFlow: EchoFlow, uploadTrackId: string) {
    if (!echoConfig.registryAddress) {
      return currentFlow;
    }

    if (!publicClient) {
      throw new Error("Sepolia RPC client is not ready yet. Retry in a few seconds.");
    }

    const registryAddress = echoConfig.registryAddress as `0x${string}`;
    const commitmentHash = buildFlowCommitmentHash(currentFlow.id, currentFlow.trackFingerprint);
    const registryRef = buildFlowRegistryRef(uploadTrackId);

    if (currentFlow.registryTrackId) {
      const alreadyRegistered = await isTrackRegisteredOnChain(
        publicClient,
        registryAddress,
        currentFlow.registryTrackId,
      );
      if (alreadyRegistered) {
        const entry = (await publicClient.readContract({
          address: registryAddress,
          abi: registryContractAbi,
          functionName: "getEntry",
          args: [currentFlow.registryTrackId],
        })) as { commitmentHash?: `0x${string}` };

        if (entry.commitmentHash?.toLowerCase() === commitmentHash.toLowerCase()) {
          return currentFlow;
        }
      }
    }

    await ensureRegistryWalletReady();

    if (!address) {
      throw new Error("Connect your wallet on Sepolia before starting analysis.");
    }

    const nullifier = worldNullifierToBigInt(currentFlow.nullifierHash);

    const recoveredTrackId = await findRegistryTrackIdByCommitment(
      publicClient,
      registryAddress,
      address,
      commitmentHash,
    );
    if (recoveredTrackId) {
      setPipelineProgressStatus("Linking existing on-chain Registry entry...");
      return persistRegistryRegistration(currentFlow.id, recoveredTrackId, commitmentHash, registryRef);
    }

    setPipelineProgressStatus("Registering track on Ethereum Sepolia...");

    try {
      const registerTxHash = await writeRegistryContract({
        address: registryAddress,
        abi: registryContractAbi,
        functionName: "registerTrack",
        args: [nullifier, commitmentHash, registryRef],
        chain: sepolia,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: registerTxHash });
      if (receipt.status !== "success") {
        throw new Error(
          "registerTrack a échoué sur Sepolia. Vérifiez votre wallet et le réseau Sepolia.",
        );
      }

      const registryTrackId = parseTrackRegisteredTrackId(receipt.logs, registryAddress);
      if (!registryTrackId) {
        throw new Error("registerTrack succeeded but TrackRegistered event was not found.");
      }

      return persistRegistryRegistration(currentFlow.id, registryTrackId, commitmentHash, registryRef);
    } catch (error) {
      const retryTrackId = await findRegistryTrackIdByCommitment(
        publicClient,
        registryAddress,
        address,
        commitmentHash,
      );
      if (retryTrackId) {
        setPipelineProgressStatus("Recovering on-chain Registry track ID...");
        return persistRegistryRegistration(currentFlow.id, retryTrackId, commitmentHash, registryRef);
      }

      throw error;
    }
  }

  async function startPipelineForFlow(flowId: string, file: File) {
    try {
      setIsStartingPipeline(true);
      setPipelineProgressStatus("Uploading track for confidential analysis...");
      const formData = new FormData();
      formData.append("flowId", flowId);
      formData.append("fingerprint", trackFingerprint);
      formData.append("file", file);

      console.log("[Echo] Uploading track...", { flowId, fingerprint: trackFingerprint });
      const uploadResponse = await fetch("/api/tracks/upload", {
        method: "POST",
        body: formData,
      });

      console.log("[Echo] /api/tracks/upload response:", uploadResponse.status);
      if (!uploadResponse.ok) {
        const errorBody = await readApiErrorBody(uploadResponse);
        console.error("[Echo] Upload error:", errorBody);
        throw new Error(formatApiError(errorBody, `Failed to upload track (HTTP ${uploadResponse.status})`));
      }

      const uploadData = (await uploadResponse.json()) as TrackUploadResponse;
      console.log("[Echo] Upload success, track:", uploadData.track?.id, "flow status:", uploadData.flow?.status);
      let activeFlow = uploadData.flow;
      setFlow(activeFlow);
      setLivePipelineSteps(uploadData.pipeline);
      setPipelineProgressStatus("Starting CRE handoff...");

      console.log("[Echo] Starting pipeline...");
      const startResponse = await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flowId,
          trackId: uploadData.track.id,
        }),
      });

      console.log("[Echo] /api/pipeline/start response:", startResponse.status);
      if (!startResponse.ok) {
        const errorBody = await readApiErrorBody(startResponse);
        console.error("[Echo] Pipeline start error:", errorBody);
        throw new Error(formatApiError(errorBody, `Failed to start pipeline (HTTP ${startResponse.status})`));
      }

      const startData = (await startResponse.json()) as {
        flow?: EchoFlow;
        pipeline?: EchoPipelineStep[];
        creTrigger?: {
          status: "disabled" | "started" | "failed";
          reason?: string;
          error?: string;
        };
      };

      console.log("[Echo] Pipeline started, creTrigger:", startData.creTrigger, "flow status:", startData.flow?.status);

      if (startData.flow) {
        setFlow(startData.flow);
      }
      if (startData.pipeline) {
        setLivePipelineSteps(startData.pipeline);
      }
      if (startData.creTrigger?.status === "failed") {
        setPipelineStarted(false);
        setCreDisabled(false);
        setPipelineProgressStatus(`CRE trigger failed: ${startData.creTrigger.error ?? "unknown error"}`);
      } else if (startData.creTrigger?.status === "disabled") {
        setPipelineStarted(true);
        setCreDisabled(true);
        setPipelineProgressStatus("Pipeline initialized. Running local simulation...");
      } else {
        setPipelineStarted(true);
        setCreDisabled(false);
        setPipelineProgressStatus("Confidential analysis pipeline running...");
      }
    } catch (error) {
      setPipelineProgressStatus(`Pipeline start failed: ${error instanceof Error ? error.message : String(error)}`);
      setPayment({
        status: "error",
        error: error instanceof Error ? error.message : "Failed to upload and start pipeline",
      });
    } finally {
      setIsStartingPipeline(false);
    }
  }

  async function handleRevealTrack() {
    if (!certificateTrackId || !echoConfig.registryAddress) {
      setPipelineProgressStatus("Reveal needs a confirmed Registry track ID first.");
      return;
    }

    try {
      setPipelineProgressStatus("Sending revealTrack transaction to Ethereum Sepolia...");
      const profileHash = toBytes32Hex(activeReport?.submitted_track?.fingerprint ?? flow?.trackFingerprint ?? "pending-profile");

      const txHash = await writeRegistryContract({
        address: echoConfig.registryAddress as `0x${string}`,
        abi: registryContractAbi,
        functionName: "revealTrack",
        args: [certificateTrackId, profileHash],
      });

      setPipelineProgressStatus(`Track revealed on-chain! Tx: ${txHash.slice(0, 12)}...`);
    } catch (error) {
      console.error("On-chain reveal failed:", error);
      setPipelineProgressStatus(`On-chain reveal failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function setFlowFromVerification(persistedFlow: EchoFlow) {
    setFlow(persistedFlow);

    if (persistedFlow.status === "pipeline_started" && persistedFlow.txHash && persistedFlow.paymentReference) {
      setPayment({
        status: "paid",
        reference: persistedFlow.paymentReference,
        hash: persistedFlow.txHash,
        mode: "evm",
      });
      setPipelineStarted(true);
    }
  }

  function getLiveStepState(status?: string): StepState {
    if (status === "running") return "active";
    if (status === "done") return "done";
    if (status === "blocked" || status === "error") return "blocked";
    return "idle";
  }

  const displaySteps = useMemo<DisplayStep[]>(() => {
    if (livePipelineSteps.length > 0) {
      return livePipelineSteps.map(s => ({
        id: s.stepKey,
        title: s.label,
        detail: s.detail,
        meta: s.meta || (s.status === "running" ? `${s.progress}%` : undefined),
        status: s.status,
        reason: s.reason,
      }));
    }

    return pipelineSteps.map(s => ({
      id: s.id,
      title: s.title,
      detail: s.detail,
      meta: s.meta,
    }));
  }, [livePipelineSteps]);

  const verdictInfo = useMemo(() => {
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

    const isPlagiat = livePipelineSteps.some(s => s.stepKey === "02A" && s.status === "blocked");
    const isSimilar = livePipelineSteps.some(s => s.stepKey === "02B" && s.status === "blocked");
    const reportVerdict = activeReport?.verdict;
    const bestMatch = bestReportMatch;

    if (flow.status === "pipeline_blocked" || isPlagiat || isSimilar || reportVerdict === "SIMILAR" || reportVerdict === "REJECTED") {
      if (isPlagiat || reportVerdict === "REJECTED") {
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
          : "The track passed analysis. Waiting for the Registry transaction.",
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
  }, [activeReport, bestReportMatch, flow, hasRegistrySeal, pipelineStarted, livePipelineSteps]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-[#f8f6ee]">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#050505]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a className="flex items-center gap-3" href="#top" aria-label="Echo home">
            <span className="grid size-10 place-items-center rounded-full bg-[#f59abd] text-[#050505]">
              <Radio className="size-5" aria-hidden="true" />
            </span>
            <span className="font-display text-xl font-black">Echo</span>
          </a>
          <div className="hidden items-center gap-2 text-sm text-white/70 md:flex">
            <span className="rounded-full border border-white/15 px-4 py-2">NYC 2026</span>
            <span className="rounded-full border border-white/15 px-4 py-2">Artist prior-art</span>
          </div>
          <WalletConnectControl tone="header" />
        </div>
      </div>

      <section id="top" className="relative px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="noise-layer" aria-hidden="true" />
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
          <div className="order-2 relative min-h-[640px] overflow-hidden rounded-[8px] border border-white/15 bg-black px-5 py-6 sm:px-8 lg:order-1 lg:px-10">
            <div className="halftone absolute -left-24 top-16 size-80 opacity-45" aria-hidden="true" />
            <div className="absolute right-8 top-8 z-10 hidden rotate-6 bg-[#fff7cf] px-6 py-5 text-center text-[#050505] starburst sm:block">
              <span className="font-hand text-lg">3 seals free</span>
            </div>

            <div className="relative z-10 flex h-full flex-col justify-between gap-10">
              <div>
                <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/70">
                  <CircleDot className="size-4 text-[#9ef7c9]" aria-hidden="true" />
                  Human-backed confidential music proof
                </div>

                <h1 className="max-w-4xl font-display text-[clamp(4rem,13vw,12rem)] font-black leading-[0.78] text-[#f59abd]">
                  Echo
                </h1>
                <p className="mt-8 max-w-3xl font-serif text-[clamp(2.35rem,5vw,5.6rem)] leading-[0.94] text-white">
                  Seal the track before the world hears it.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_0.8fr] sm:items-end">
                <div className="rounded-[8px] border border-white/15 bg-[#080808] p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <span className="font-hand text-2xl text-[#fff7cf]">private until reveal</span>
                    <LockKeyhole className="size-5 text-[#f59abd]" aria-hidden="true" />
                  </div>
                  <p className="max-w-xl text-lg leading-7 text-white/72">
                    A TEE-attested prior-art record for unreleased music, designed for artists who need proof without public exposure.
                  </p>
                </div>

                <div className="relative mx-auto aspect-square w-full max-w-[280px]">
                  <VinylVisual isPlaying={isPlaying} />
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 relative rounded-[8px] border border-white/15 bg-[#0a0a0a] p-4 sm:p-6 lg:order-2 lg:p-8">
            <div className="absolute -right-4 -top-5 rotate-3 rounded-[8px] border border-[#f59abd] bg-[#050505] px-4 py-2 font-hand text-xl text-[#f59abd]">
              artist mode
            </div>

            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase text-white/45">MVP console</p>
                <h2 className="mt-1 font-display text-3xl font-black">Register a track</h2>
              </div>
              <button
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 px-5 font-bold transition hover:border-[#f59abd] hover:text-[#f59abd]"
                onClick={() => setIsPlaying((value) => !value)}
                type="button"
              >
                {isPlaying ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                Preview
              </button>
            </div>

            <label
              className={`group block cursor-pointer rounded-[8px] border transition-all duration-200 p-6 ${
                isDragging
                  ? "border-solid border-[#f59abd] bg-[#f59abd]/10 scale-[1.01]"
                  : "border-dashed border-white/25 bg-white/[0.03] hover:border-[#f59abd] hover:bg-[#f59abd]/10"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  await handleAudioFile(file);
                }
              }}
            >
              <input
                className="sr-only"
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp3"
                onChange={handleAudioSelect}
                suppressHydrationWarning
              />
              <span className="flex min-h-48 flex-col justify-between gap-8">
                <span className="flex items-start justify-between gap-4">
                  <span className="grid size-14 place-items-center rounded-full bg-[#f59abd] text-[#050505]">
                    <Upload className="size-6" aria-hidden="true" />
                  </span>
                  <span className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/60">WAV / MP3</span>
                </span>
                <span>
                  <span className="block break-words font-display text-4xl font-black text-white">
                    {isDragging ? "Drop your track here!" : selectedLabel}
                  </span>
                  <span className="mt-3 block text-base text-white/55">
                    {isDragging ? "Release to begin hashing" : "Client-side encrypted audio, then confidential comparison."}
                  </span>
                </span>
              </span>
            </label>

            <div className="mt-5 grid gap-3 xl:grid-cols-3">
              <button
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#fff7cf] px-5 font-black text-[#050505] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canVerify}
                onClick={handleVerifyWorld}
                type="button"
              >
                <Fingerprint className="size-5" aria-hidden="true" />
                {verification.status === "verified"
                  ? "World ID OK"
                  : verification.status === "pending"
                    ? "Verifying..."
                    : audioName && !trackFingerprint
                      ? "Hashing..."
                      : audioName
                        ? "Verify World ID"
                        : "Add track first"}
              </button>
              <WalletConnectControl tone="panel" />
              <button
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#f59abd] px-5 font-black text-[#050505] transition hover:bg-[#ffb1ce] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={
                  payment.status === "paid"
                    ? !canStartAnalysis || isStartingPipeline
                    : !canPay
                }
                onClick={handlePrimaryAction}
                type="button"
              >
                <Upload className="size-5" aria-hidden="true" />
                {payment.status === "paid"
                  ? isStartingPipeline
                    ? "Starting..."
                    : flow?.status === "pipeline_completed"
                      ? "Analysis complete"
                      : flow?.status === "pipeline_blocked" || flow?.status === "error"
                        ? "Analysis stopped"
                        : pipelineStarted
                          ? "Analysis running"
                          : "Upload / Start analysis"
                  : "Pay Sepolia fee"}
              </button>
            </div>

            <div className="mt-4 rounded-[8px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
              <span className="font-bold text-white/80">Flow status:</span> {flowStatus}
              {flow ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <span className="font-bold text-white/80">Flow ID:</span>
                  <code className="max-w-full truncate rounded-full border border-white/10 bg-black/30 px-3 py-1 font-mono text-xs text-[#9ef7c9]">{flow.id}</code>
                  <button
                    className="inline-flex min-h-8 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-bold text-white/70 transition hover:border-[#f59abd] hover:text-[#f59abd]"
                    onClick={handleCopyFlowId}
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

            <div className="mt-6 rounded-[8px] border border-white/10 bg-black/40">
              {displaySteps.map((step) => {
                const liveState = getLiveStepState(step.status);
                const stepState: StepState = livePipelineSteps.length > 0 
                  ? liveState 
                  : (pipelineStarted ? "active" : "idle");
                return (
                  <PipelineRow key={step.id} step={step} state={stepState} />
                );
              })}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 flex w-full max-w-7xl overflow-hidden rounded-full border border-white/10 bg-white/[0.03] py-3">
          <div className="marquee flex min-w-full shrink-0 items-center gap-8 px-6 text-sm font-bold uppercase text-white/60">
            {[...sponsors, ...sponsors].map((item, index) => (
              <span className="flex items-center gap-8" key={`${item}-${index}`}>
                {item}
                <Sparkles className="size-4 text-[#fff7cf]" aria-hidden="true" />
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="pipeline" className="px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto flex flex-col gap-6 lg:gap-8 w-full max-w-7xl">
          <div>
            <p className="font-hand text-2xl sm:text-3xl text-[#9ef7c9]">echo, but sealed</p>
            <h2 className="mt-2 sm:mt-4 max-w-3xl font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-black leading-[0.9]">
              One private run. One public timestamp.
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 sm:gap-4">
            {displaySteps.map((step) => {
              const liveState = getLiveStepState(step.status);
              const progressWidth = step.meta && step.meta.endsWith("%")
                ? step.meta
                : liveState === "done"
                  ? "100%"
                  : liveState === "active"
                    ? "50%"
                    : "10%";
              const borderClass = liveState === "blocked"
                ? "border-[#ff7777]/40 bg-[#ff7777]/5"
                : liveState === "active"
                  ? "border-[#fff7cf]/40 bg-[#fff7cf]/5"
                  : "border-white/15 bg-[#080808]";
              return (
                <div className={`min-h-48 sm:min-h-56 lg:min-h-[170px] xl:min-h-[200px] rounded-[8px] border p-4 sm:p-5 transition-colors duration-200 ${borderClass}`} key={step.id}>
                  <div className="mb-4 sm:mb-8 lg:mb-3 xl:mb-6 flex items-start justify-between gap-2">
                    <span className={`font-display text-4xl sm:text-5xl lg:text-3xl xl:text-4xl font-black ${liveState === "blocked" ? "text-[#ff7777]" : "text-[#f59abd]"}`}>{step.id}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm text-white/55">
                      {step.id === "02A" || step.id === "02B" ? "Parallel" : "Sequential"}
                    </span>
                  </div>
                  <h3 className="font-display text-lg sm:text-2xl lg:text-base xl:text-lg font-black truncate lg:whitespace-normal">{step.title}</h3>
                  <p className="mt-1 sm:mt-2 text-sm sm:text-lg lg:text-xs xl:text-sm text-white/55 line-clamp-2 lg:line-clamp-none">{step.detail}</p>
                  {step.reason && (
                    <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-[#ff7777] font-semibold line-clamp-2">{step.reason}</p>
                  )}
                  <div className="mt-4 sm:mt-8 lg:mt-3 xl:mt-5 h-2 rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${liveState === "blocked" ? "bg-[#ff7777]" : "bg-[#9ef7c9]"}`}
                      style={{ width: progressWidth }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="report" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-hand text-3xl text-[#fff7cf]">verdict board</p>
              <h2 className={`mt-3 font-display text-[clamp(2.8rem,6vw,6rem)] font-black leading-[0.9] ${verdictInfo.colorClass}`}>
                {verdictInfo.title}
              </h2>
              <p className="mt-2 text-white/60 text-lg">{verdictInfo.subtitle}</p>
            </div>
            <div className={`rounded-full border px-5 py-3 font-black ${verdictInfo.badgeClass}`}>
              {verdictInfo.badgeText} {verdictInfo.bestMatch > 0 ? `· Best match ${verdictInfo.bestMatch}%` : ""}
            </div>
          </div>

          {verdictInfo.showMatches && reportMatches.length > 0 ? (
            <div className="overflow-hidden rounded-[8px] border border-white/15 bg-[#080808]">
              <div className="grid grid-cols-[56px_1.6fr_repeat(6,minmax(92px,1fr))] overflow-x-auto text-sm">
                <div className="contents text-white/45">
                  <div className="min-w-14 border-b border-white/10 p-4">#</div>
                  <div className="min-w-64 border-b border-white/10 p-4">Track</div>
                  <div className="min-w-24 border-b border-white/10 p-4">Global</div>
                  <div className="min-w-24 border-b border-white/10 p-4">Melody</div>
                  <div className="min-w-24 border-b border-white/10 p-4">Rhythm</div>
                  <div className="min-w-24 border-b border-white/10 p-4">Structure</div>
                  <div className="min-w-28 border-b border-white/10 p-4">Key / BPM</div>
                  <div className="min-w-32 border-b border-white/10 p-4">Source</div>
                </div>
                {reportMatches.map((match) => (
                  <div className="contents" key={match.rank}>
                    <div className="min-w-14 border-b border-white/10 p-4 text-white/55">{match.rank}</div>
                    <div className="min-w-64 border-b border-white/10 p-4 font-bold">{match.title}</div>
                    <div className={`min-w-24 border-b border-white/10 p-4 font-black ${scoreTone(match.score)}`}>{match.score}%</div>
                    <div className="min-w-24 border-b border-white/10 p-4 text-white/65">{match.melody}%</div>
                    <div className="min-w-24 border-b border-white/10 p-4 text-white/65">{match.rhythm}%</div>
                    <div className="min-w-24 border-b border-white/10 p-4 text-white/65">{match.structure}%</div>
                    <div className="min-w-28 border-b border-white/10 p-4 text-white/65">{match.keyLabel}</div>
                    <div className="min-w-32 border-b border-white/10 p-4 text-white/65">{match.source}</div>
                  </div>
                ))}
              </div>
              {activeReport?.ai_summary ? (
                <p className="border-t border-white/10 p-4 text-sm leading-6 text-white/65">{activeReport.ai_summary}</p>
              ) : null}
            </div>
          ) : verdictInfo.showMatches && activeReport ? (
            <div className="rounded-[8px] border border-white/15 bg-[#080808] p-6 sm:p-8">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    label: "Key / mode",
                    value: `${activeReport.submitted_track?.key ?? "Unknown"} ${activeReport.submitted_track?.mode ?? ""}`.trim(),
                  },
                  {
                    label: "BPM",
                    value: typeof activeReport.submitted_track?.BPM === "number" ? String(activeReport.submitted_track.BPM) : "Unknown",
                  },
                  {
                    label: "Fingerprint",
                    value: activeReport.submitted_track?.fingerprint
                      ? `${activeReport.submitted_track.fingerprint.slice(0, 18)}...`
                      : "Not provided",
                  },
                ].map((item) => (
                  <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4" key={item.label}>
                    <p className="text-xs uppercase tracking-wider text-white/40">{item.label}</p>
                    <p className="mt-2 break-words font-mono text-sm text-white/80">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-[8px] border border-[#9ef7c9]/20 bg-[#9ef7c9]/10 p-5">
                <p className={`font-bold ${verdictInfo.colorClass}`}>
                  {activeReport.verdict === "CLEAN"
                    ? "No similar tracks above the report threshold."
                    : "Final report received without ranked similarity rows."}
                </p>
                {activeReport.ai_summary ? (
                  <p className="mt-3 text-sm leading-6 text-white/70">{activeReport.ai_summary}</p>
                ) : null}
              </div>
            </div>
          ) : flow?.status === "pipeline_blocked" || flow?.status === "error" ? (
            <div className="rounded-[8px] border border-dashed border-white/15 bg-white/[0.01] p-12 text-center text-white/55">
              <p className="font-bold text-white/80">
                {flow.status === "pipeline_blocked" ? "Analyse terminée — aucun seal on-chain" : "Erreur pipeline"}
              </p>
              <p className="mt-3 text-sm leading-6">
                {activeReport?.ai_summary
                  ?? livePipelineSteps.find((step) => step.status === "blocked")?.reason
                  ?? flow.error
                  ?? "Aucune transaction Registry n'a été créée."}
              </p>
            </div>
          ) : (
            <div className="rounded-[8px] border border-dashed border-white/15 bg-white/[0.01] p-12 text-center text-white/45">
              {pipelineStarted ? "Verification in progress..." : "No track has been verified yet."}
            </div>
          )}
        </div>
      </section>

      <section id="seal" className="px-4 pb-32 pt-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1fr_0.82fr] lg:items-stretch">
          {flow?.status === "pipeline_blocked" ? (
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
                  <span className="font-bold text-white">Match détecté :</span>
                  <p className="mt-1 text-sm leading-6">
                    {activeReport?.similar_tracks?.[0]?.title
                      ?? livePipelineSteps.find((step) => step.status === "blocked")?.reason
                      ?? "Similarité élevée détectée."}
                  </p>
                  {activeReport?.similar_tracks?.[0]?.score ? (
                    <p className="mt-2 font-mono text-sm text-white/75">
                      Score {activeReport.similar_tracks[0].score}%
                      {activeReport.similar_tracks[0].key.startsWith("ISRC")
                        ? ` · ${activeReport.similar_tracks[0].key}`
                        : null}
                    </p>
                  ) : null}
                  {activeReport?.ai_summary ? (
                    <p className="mt-3 font-mono text-xs text-white/60">{activeReport.ai_summary}</p>
                  ) : null}
                </div>
              </div>
              <div className="mt-10 font-bold text-white/45 text-sm">
                No on-chain seal was created.
              </div>
            </div>
          ) : hasRegistrySeal ? (
            <div className="relative overflow-hidden rounded-[8px] border border-white/15 bg-[#f8f6ee] p-6 text-[#050505] sm:p-8">
              <div className="absolute right-8 top-8 rounded-full bg-[#050505] px-4 py-2 text-sm font-black text-[#f8f6ee]">
                SEALED
              </div>
              <p className="font-hand text-3xl text-[#f59abd]">sealed certificate</p>
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
                  value={certificateTrackId ?? "Not provided"}
                  copyValue={certificateTrackId}
                />
                <CertificateMetric
                  label="Registry tx"
                  value={certificateTxHash ?? "Not provided"}
                  copyValue={certificateTxHash ?? undefined}
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
                  label="Registry"
                  value={echoConfig.registryChainId === sepolia.id ? "Ethereum Sepolia" : `Chain ${echoConfig.registryChainId}`}
                />
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#050505]/20 px-5 font-black transition hover:border-[#050505]"
                  href={`${echoConfig.registryExplorer}/tx/${certificateTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Etherscan
                </a>
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-[8px] border border-white/15 bg-[#080808] p-6 text-white sm:p-8">
              <div className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-black text-white/55 w-fit">
                CERTIFICATE PENDING
              </div>
              <p className="mt-8 font-hand text-3xl text-[#f59abd]">no seal yet</p>
              <h2 className="mt-4 max-w-3xl font-display text-[clamp(3rem,7vw,7rem)] font-black leading-[0.86]">
                Certificate appears only after a clean Registry transaction.
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-7 text-white/62">
                Echo will show the commitment hash, registry reference, track ID, Sepolia transaction, and timestamp after the CRE/backend writes a confirmed CLEAN seal.
              </p>
              {flow?.status === "pipeline_completed" ? (
                <p className="mt-6 rounded-[8px] border border-[#9ef7c9]/25 bg-[#9ef7c9]/10 p-4 text-sm font-bold text-[#9ef7c9]">
                  {flow.registryTxHash
                    ? "Registry seal confirmed on Sepolia."
                    : isSealingOnChain
                      ? "Verdict CLEAN — registerTrack et callback CRE en cours..."
                      : "Verdict CLEAN reçu — inscription on-chain après analyse (pas avant)."}
                </p>
              ) : null}
            </div>
          )}

          <div className="rounded-[8px] border border-white/15 bg-[#080808] p-6 sm:p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase text-white/45">Reveal queue</p>
                <h3 className="mt-1 font-display text-3xl font-black">Artist controls</h3>
              </div>
              <Disc3 className="size-10 text-[#8fd5ff]" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              {[
                flow?.status === "pipeline_blocked" ? "Seal execution cancelled" : "SEALED entry is private",
                hasRegistrySeal ? "Report linked to backend registry record" : "Certificate waits for Registry tx",
                "Reveal requires wallet signature",
              ].map((item) => (
                <div className="flex min-h-14 items-center gap-3 rounded-[8px] border border-white/10 px-4" key={item}>
                  <span className={`grid size-7 place-items-center rounded-full text-[#050505] ${flow?.status === "pipeline_blocked" ? "bg-[#ff7777]" : "bg-[#9ef7c9]"}`}>
                    {flow?.status === "pipeline_blocked" ? <X className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                  </span>
                  <span className="font-bold text-white/75">{item}</span>
                </div>
              ))}
            </div>
            <button
              className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#8fd5ff] px-5 font-black text-[#050505] transition hover:bg-[#b8e5ff] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!hasRegistrySeal || !certificateTrackId || isWritingRegistry}
              onClick={handleRevealTrack}
            >
              {isWritingRegistry ? "Revealing..." : "Reveal track"}
              <ArrowUpRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {worldQr ? <WorldIdQrModal connectorURI={worldQr.connectorURI} imageDataUrl={worldQr.imageDataUrl} onClose={() => setWorldQr(null)} /> : null}

      <nav className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-full border border-white/10 bg-[#111]/90 p-1 shadow-2xl backdrop-blur-xl">
        <a className="rounded-full bg-white/10 px-5 py-3 font-display text-lg font-black" href="#top">
          Echo
        </a>
        <a className="hidden rounded-full px-4 py-3 text-sm font-bold text-white/75 transition hover:bg-white/10 sm:block" href="#pipeline">
          Pipeline
        </a>
        <a className="hidden rounded-full px-4 py-3 text-sm font-bold text-white/75 transition hover:bg-white/10 sm:block" href="#report">
          Report
        </a>
        <a className="hidden rounded-full px-4 py-3 text-sm font-bold text-white/75 transition hover:bg-white/10 sm:block" href="#seal">
          Seal
        </a>
        <a className="rounded-full bg-[#fff7cf] px-5 py-3 font-hand text-lg text-[#050505]" href="#top">
          start
        </a>
      </nav>
    </main>
  );
}

async function readApiErrorBody(response: Response): Promise<unknown> {
  const raw = await response.text().catch(() => "");
  if (!raw.trim()) {
    return { error: response.statusText || "Empty error response" };
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { error: raw.trim().slice(0, 240) };
  }
}

function formatApiError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") {
    return fallback;
  }

  const apiError = body as { error?: string; details?: unknown };

  if (typeof apiError.details === "string") {
    return `${apiError.error ?? fallback}: ${apiError.details}`;
  }

  if (apiError.details && typeof apiError.details === "object") {
    return `${apiError.error ?? fallback}: ${JSON.stringify(apiError.details)}`;
  }

  return apiError.error ?? fallback;
}

function WorldIdQrModal({
  connectorURI,
  imageDataUrl,
  onClose,
}: {
  connectorURI: string;
  imageDataUrl: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/78 px-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="world-id-title">
      <div className="relative w-full max-w-[440px] rounded-[8px] border border-white/15 bg-[#050505] p-5 text-[#f8f6ee] shadow-2xl sm:p-6">
        <button
          className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-white/15 text-white/70 transition hover:border-[#f59abd] hover:text-[#f59abd]"
          onClick={onClose}
          type="button"
          aria-label="Close World ID QR"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="mb-5 flex items-center gap-3 pr-12">
          <span className="grid size-12 place-items-center rounded-full bg-[#fff7cf] text-[#050505]">
            <QrCodeIcon className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm uppercase text-white/45">World ID</p>
            <h2 id="world-id-title" className="font-display text-2xl font-black">
              Scan with World App
            </h2>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#fff7cf]/40 bg-[#fff7cf] p-4">
          <Image
            className="mx-auto aspect-square w-full max-w-[320px]"
            src={imageDataUrl}
            alt="World ID verification QR code"
            width={320}
            height={320}
            unoptimized
          />
        </div>

        <div className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/62">
          Open World App, scan this code, then approve the proof. Echo will continue automatically once the proof is returned.
        </div>

        <a
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f59abd] px-5 font-black text-[#050505] transition hover:bg-[#ffb1ce]"
          href={connectorURI}
          rel="noreferrer"
          target="_blank"
        >
          Open World App
          <ArrowUpRight className="size-5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function WalletConnectControl({ tone }: { tone: "header" | "panel" }) {
  const className =
    tone === "header"
      ? "inline-flex h-11 items-center gap-2 rounded-full bg-[#fff7cf] px-5 font-bold text-[#050505] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      : "inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/15 px-5 font-black text-white transition hover:border-[#8fd5ff] hover:text-[#8fd5ff] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const connected = mounted && account && chain;

        if (!mounted) {
          return (
            <button className={className} disabled type="button">
              <WalletCards className="size-4" aria-hidden="true" />
              Connect wallet
            </button>
          );
        }

        if (!connected) {
          return (
            <button className={className} onClick={openConnectModal} type="button">
              <WalletCards className="size-4" aria-hidden="true" />
              Connect wallet
            </button>
          );
        }

        if (chain.unsupported || chain.id !== sepolia.id) {
          return (
            <button className={className} onClick={openChainModal} type="button">
              <WalletCards className="size-4" aria-hidden="true" />
              Wrong network
            </button>
          );
        }

        return (
          <button className={className} onClick={openAccountModal} type="button">
            <WalletCards className="size-4" aria-hidden="true" />
            {tone === "header" ? account.displayName : `Sepolia · ${account.displayName}`}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

function PipelineRow({
  step,
  state,
}: {
  step: DisplayStep;
  state: StepState;
}) {
  const status = {
    idle: { label: "Waiting", className: "text-white/35", icon: CircleDot },
    active: { label: "Running", className: "text-[#fff7cf]", icon: Waves },
    done: { label: "Done", className: "text-[#9ef7c9]", icon: Check },
    blocked: { label: "Stopped", className: "text-[#ff7777]", icon: CircleDot },
  }[state];

  const Icon = status.icon;

  return (
    <div className="grid min-h-20 grid-cols-[58px_1fr_auto] items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0">
      <span className="font-display text-2xl font-black text-white/45">{step.id}</span>
      <span>
        <span className="block font-bold">{step.title}</span>
        <span className="block text-sm text-white/45">{step.detail}</span>
      </span>
      <span className={`flex items-center gap-2 text-sm font-bold ${status.className}`}>
        <Icon className="size-4" aria-hidden="true" />
        {state === "done" ? step.meta : status.label}
      </span>
    </div>
  );
}

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

function VinylVisual({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className={`vinyl relative size-full rounded-full border border-white/20 bg-[#111] ${isPlaying ? "animate-spin-slow" : ""}`}>
        <div className="absolute inset-[8%] rounded-full border border-white/10" />
        <div className="absolute inset-[18%] rounded-full border border-white/10" />
        <div className="absolute inset-[30%] rounded-full border border-white/10" />
        <div className="absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#f59abd] text-[#050505]">
          <FileAudio className="size-9" aria-hidden="true" />
        </div>
      </div>
      <svg className="pointer-events-none absolute -right-6 top-8 h-44 w-40 text-[#fff7cf]" viewBox="0 0 180 190" fill="none" aria-hidden="true">
        <path d="M144 18C127 53 120 75 124 102C128 130 118 151 88 168" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
        <path d="M87 168C59 184 28 171 23 146C19 126 33 111 55 111C79 111 94 132 88 168Z" fill="currentColor" />
        <path d="M27 46L51 58L27 70L15 94L3 70L-21 58L3 46L15 22L27 46Z" fill="currentColor" transform="translate(38 10)" />
      </svg>
    </div>
  );
}
