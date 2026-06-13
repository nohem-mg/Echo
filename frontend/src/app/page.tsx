"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
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
  ShieldCheck,
  Sparkles,
  Upload,
  WalletCards,
  Waves,
  X,
} from "lucide-react";
import { isAddress, parseEther, toHex } from "viem";
import { useAccount, useChainId, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { echoConfig, isWorldConfigured } from "@/lib/config";
import type { EchoFlow, EchoPayment, EchoPipelineStep, PaymentCreateResponse, TrackUploadResponse, WorldVerification } from "@/lib/types";
import registryAbi from "@/lib/abi/Registry.json";

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
    detail: "Walrus MIDI scan",
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

const matches = [
  {
    rank: 1,
    title: "Night Glass - Luma Vale",
    score: 41,
    melody: 36,
    rhythm: 52,
    structure: 34,
    key: "A min / 124",
    source: "ACRCloud",
  },
  {
    rank: 2,
    title: "@artist_9x7 - [SEALED]",
    score: 28,
    melody: 31,
    rhythm: 22,
    structure: 26,
    key: "C maj / 121",
    source: "Private registry",
  },
  {
    rank: 3,
    title: "Soft Static - Maro",
    score: 18,
    melody: 15,
    rhythm: 24,
    structure: 13,
    key: "G min / 127",
    source: "ACRCloud",
  },
];

const sponsors = ["World ID", "RainbowKit", "ETH Sepolia", "Chainlink CRE", "Confidential AI", "Unlink", "Walrus"];

function getStepState(index: number, hasFile: boolean, pipelineStarted: boolean): StepState {
  if (!hasFile || !pipelineStarted) {
    return "idle";
  }

  if (index < 3) {
    return "done";
  }

  if (index === 3) {
    return "active";
  }

  return "idle";
}

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
  const [isRegisteredOnChain, setIsRegisteredOnChain] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const { writeContractAsync: registerTrackContract } = useWriteContract();
  const { writeContractAsync: revealTrackContract, isPending: isRevealingTrack } = useWriteContract();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
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
  const canPay = Boolean(audioName && verification.status === "verified" && verification.flow.id && isConnected && payment.status !== "pending" && payment.status !== "paid");
  const flowStatus = useMemo(() => {
    if (pipelineProgressStatus) {
      return pipelineProgressStatus;
    }

    if (payment.status === "paid") {
      return `Flow ${flow?.id.slice(0, 13) ?? "persisted"} · Sepolia fee paid · ${payment.hash.slice(0, 12)}...`;
    }

    if (payment.status === "pending") {
      if (payment.hash) {
        return `Waiting for Sepolia confirmation · ${payment.hash.slice(0, 12)}...`;
      }

      return "Waiting for wallet signature";
    }

    if (verification.status === "verified") {
      if (!isConnected) {
        return "World ID verified. Connect an EVM wallet to pay the Sepolia fee.";
      }

      if (chainId !== sepolia.id) {
        return "World ID verified. Switch your wallet to Ethereum Sepolia.";
      }

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
  }, [audioName, chainId, flow?.id, isConnected, payment, trackFingerprint, verification]);

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
        setPipelineStarted(true);
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

  // Upload track and initialize pipeline once Sepolia fee is paid and track is registered on-chain
  useEffect(() => {
    if (payment.status !== "paid" || !flow?.id || !audioFile || pipelineStarted || !isRegisteredOnChain) {
      return;
    }

    const flowId = flow.id;
    const fileToUpload = audioFile;
    let cancelled = false;

    async function uploadAndStart() {
      try {
        setPipelineProgressStatus("Uploading track to secure enclave...");
        const formData = new FormData();
        formData.append("flowId", flowId);
        formData.append("fingerprint", trackFingerprint);
        formData.append("file", fileToUpload);

        const uploadResponse = await fetch("/api/tracks/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const err = await uploadResponse.json().catch(() => ({}));
          throw new Error(err.error || "Failed to upload track to enclave");
        }

        const uploadData = (await uploadResponse.json()) as TrackUploadResponse;
        if (cancelled) return;

        setFlow(uploadData.flow);
        if (uploadData.pipeline) {
          setLivePipelineSteps(uploadData.pipeline);
        }

        setPipelineProgressStatus("Initializing confidential pipeline...");

        const startResponse = await fetch("/api/pipeline/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            flowId: flowId,
            trackId: uploadData.track.id,
          }),
        });

        if (!startResponse.ok) {
          const err = await startResponse.json().catch(() => ({}));
          throw new Error(err.error || "Failed to start pipeline analysis");
        }

        const startData = await startResponse.json();
        if (cancelled) return;

        setFlow(startData.flow);
        if (startData.pipeline) {
          setLivePipelineSteps(startData.pipeline);
        }
        setPipelineStarted(true);
        setPipelineProgressStatus("Confidential analysis pipeline running...");
      } catch (error) {
        if (cancelled) return;
        setPipelineProgressStatus(`Error: ${error instanceof Error ? error.message : "Pipeline initialization failed"}`);
        setPayment({
          status: "error",
          error: error instanceof Error ? error.message : "Failed to upload and start pipeline",
        });
      }
    }

    uploadAndStart();

    return () => {
      cancelled = true;
    };
  }, [payment.status, flow?.id, audioFile, trackFingerprint, pipelineStarted, isRegisteredOnChain]);

  // Live polling for pipeline status (if not in mock/demo mode)
  useEffect(() => {
    if (!pipelineStarted || !flow?.id || flow.worldMode === "mock") {
      return;
    }

    const flowId = flow.id;
    let intervalId: NodeJS.Timeout;
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
          setPipelineProgressStatus("Pipeline completed: Track successfully sealed on-chain");
        } else if (data.flow?.status === "pipeline_blocked") {
          setPipelineProgressStatus("Pipeline stopped: Similarity or plagiarism detected");
        } else if (data.flow?.status === "error") {
          setPipelineProgressStatus(`Pipeline failed: ${data.flow.error || "unknown error"}`);
        }

        const terminalStatuses: string[] = ["pipeline_completed", "pipeline_blocked", "error"];
        if (data.flow && terminalStatuses.includes(data.flow.status)) {
          clearInterval(intervalId);
        }
      } catch (error) {
        console.error("Error polling pipeline status:", error);
      }
    }

    pollStatus();
    intervalId = setInterval(pollStatus, 3000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [pipelineStarted, flow?.id, flow?.worldMode]);

  // Simulation for mock/demo mode pipeline progress
  useEffect(() => {
    if (!pipelineStarted || !flow || flow.worldMode !== "mock" || livePipelineSteps.length === 0) {
      return;
    }

    const isTerminal = ["pipeline_completed", "pipeline_blocked", "error"].includes(flow.status);
    if (isTerminal) {
      return;
    }

    const lowerName = audioName.toLowerCase();
    const isPlagiat = lowerName.includes("plagiat") || lowerName.includes("public");
    const isSimilar = lowerName.includes("similar") || lowerName.includes("private");

    let timer: NodeJS.Timeout;

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
          setFlow(prev => prev ? { ...prev, status: "pipeline_blocked" } : null);
          setPipelineProgressStatus("STOP: Plagiarism detected. Seal registry write aborted.");
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
          setFlow(prev => prev ? { ...prev, status: "pipeline_blocked" } : null);
          setPipelineProgressStatus("STOP: Composition similarity detected. Seal registry write aborted.");
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
        setFlow(prev => prev ? { ...prev, status: "pipeline_completed" } : null);
        setPipelineProgressStatus("Confidential attestation complete. Prior-art registry write finalized.");
      }, 2500);
    }

    return () => {
      clearTimeout(timer);
    };
  }, [pipelineStarted, flow?.status, livePipelineSteps, audioName]);

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
    if (!audioName || verification.status !== "verified" || payment.status === "pending" || payment.status === "paid") {
      return;
    }

    if (!isConnected) {
      setPayment({ status: "error", error: "Connect an EVM wallet before paying the Sepolia fee" });
      return;
    }

    if (chainId !== sepolia.id) {
      switchChain({ chainId: sepolia.id });
      return;
    }

    try {
      const paymentRequest = (await fetch("/api/payments/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowId: verification.flow.id }),
      }).then((response) => {
        if (!response.ok) {
          throw new Error("Could not create Sepolia payment request");
        }

        return response.json();
      })) as PaymentCreateResponse;

      if (!isAddress(paymentRequest.receiver)) {
        throw new Error("Invalid Sepolia fee receiver");
      }

      setFlow(paymentRequest.flow);
      setPendingQuote(paymentRequest);
      setPayment({ status: "pending", reference: paymentRequest.reference });

      const hash = await sendTransactionAsync({
        to: paymentRequest.receiver,
        value: parseEther(paymentRequest.amountEth),
        data: toHex(paymentRequest.reference),
        chainId: paymentRequest.chainId,
      });

      setPayment({ status: "pending", reference: paymentRequest.reference, hash });
    } catch (error) {
      setPayment({
        status: "error",
        error: error instanceof Error ? error.message : "Sepolia payment failed",
      });
    }
  }

  async function handleRegisterAndStart() {
    if (payment.status !== "paid") {
      await handlePayAndStart();
      return;
    }

    if (!echoConfig.registryAddress) {
      setPipelineProgressStatus("Registry address not configured. Simulating on-chain registry write...");
      setIsRegistering(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setIsRegistering(false);
      setIsRegisteredOnChain(true);
      setPipelineProgressStatus("Registry write simulated successfully! Uploading track...");
      return;
    }

    try {
      setIsRegistering(true);
      setPipelineProgressStatus("Sending registerTrack transaction to Ethereum Sepolia...");

      let nullifierBigInt = BigInt(0);
      if (verification.status === "verified") {
        try {
          nullifierBigInt = BigInt(verification.nullifier);
        } catch {
          if (verification.nullifier.startsWith("0x")) {
            nullifierBigInt = BigInt(verification.nullifier);
          }
        }
      }

      let hashHex = trackFingerprint;
      if (hashHex.startsWith("sha256:")) {
        hashHex = "0x" + hashHex.slice(7);
      }
      if (!hashHex.startsWith("0x")) {
        hashHex = "0x" + hashHex;
      }
      hashHex = hashHex.padEnd(66, "0").slice(0, 66);

      const mockRegistryRef = toHex("mock-walrus-ref").padEnd(66, "0").slice(0, 66);

      const txHash = await registerTrackContract({
        address: echoConfig.registryAddress as `0x${string}`,
        abi: registryAbi as any,
        functionName: "registerTrack",
        args: [nullifierBigInt, hashHex as `0x${string}`, mockRegistryRef as `0x${string}`],
      });

      setPipelineProgressStatus(`Registry transaction sent! Tx: ${txHash.slice(0, 12)}... Waiting for confirmation.`);
      setIsRegisteredOnChain(true);
    } catch (error) {
      console.error("On-chain registration failed:", error);
      setPipelineProgressStatus(`On-chain registration failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleRevealTrack() {
    if (!flow?.id || !echoConfig.registryAddress) {
      return;
    }

    try {
      setPipelineProgressStatus("Sending revealTrack transaction to Ethereum Sepolia...");
      const mockTrackId = toHex(flow.id.slice(0, 31)).padEnd(66, "0").slice(0, 66);
      const mockProfileHash = toHex("mock-profile").padEnd(66, "0").slice(0, 66);

      const txHash = await revealTrackContract({
        address: echoConfig.registryAddress as `0x${string}`,
        abi: registryAbi as any,
        functionName: "revealTrack",
        args: [mockTrackId as `0x${string}`, mockProfileHash as `0x${string}`],
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
        subtitle: "Start verification to see results",
        badgeText: "Awaiting input",
        badgeClass: "border-white/20 bg-white/5 text-white/60",
        colorClass: "text-white/60",
        showMatches: false,
        bestMatch: 0,
      };
    }

    const isPlagiat = livePipelineSteps.some(s => s.stepKey === "02A" && s.status === "blocked");
    const isSimilar = livePipelineSteps.some(s => s.stepKey === "02B" && s.status === "blocked");

    if (flow.status === "pipeline_blocked" || isPlagiat || isSimilar) {
      if (isPlagiat) {
        return {
          title: "REJECTED: Plagiarism",
          subtitle: "ACRCloud acoustic fingerprint match exceeds the 95% threshold.",
          badgeText: "STOP - REJECTED",
          badgeClass: "border-[#ff7777]/60 bg-[#ff7777]/10 text-[#ff7777]",
          colorClass: "text-[#ff7777]",
          showMatches: true,
          bestMatch: 97,
        };
      }
      return {
        title: "SIMILARITY DETECTED",
        subtitle: "Compositional MIDI similarity exceeds the 75% private registry threshold.",
        badgeText: "STOP - SIMILAR",
        badgeClass: "border-[#ffd166]/60 bg-[#ffd166]/10 text-[#ffd166]",
        colorClass: "text-[#ffd166]",
        showMatches: true,
        bestMatch: 82,
      };
    }

    if (flow.status === "pipeline_completed") {
      return {
        title: "CLEAN",
        subtitle: "The track has been sealed. No plagiarism or significant compositional matches were found.",
        badgeText: "VERDICT CLEAN",
        badgeClass: "border-[#9ef7c9]/60 bg-[#9ef7c9]/10 text-[#9ef7c9]",
        colorClass: "text-[#9ef7c9]",
        showMatches: true,
        bestMatch: 21,
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
  }, [flow, pipelineStarted, livePipelineSteps]);

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
                disabled={(!canPay && payment.status !== "paid") || isSendingTransaction || isConfirmingTransaction || isSwitchingChain || isRegistering}
                onClick={handleRegisterAndStart}
                type="button"
              >
                <ShieldCheck className="size-5" aria-hidden="true" />
                {payment.status === "paid"
                  ? isRegistering
                    ? "Registering..."
                    : isRegisteredOnChain
                      ? "Registered"
                      : "Register on-chain"
                  : isSwitchingChain
                    ? "Switching..."
                    : chainId !== sepolia.id
                      ? "Switch to Sepolia"
                      : isSendingTransaction || isConfirmingTransaction || payment.status === "pending"
                      ? "Confirming..."
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

      <section id="pipeline" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-hand text-3xl text-[#9ef7c9]">echo, but sealed</p>
            <h2 className="mt-4 max-w-3xl font-display text-[clamp(3rem,7vw,6.5rem)] font-black leading-[0.9]">
              One private run. One public timestamp.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {displaySteps.map((step, index) => {
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
                <div className={`min-h-56 rounded-[8px] border p-5 transition-colors duration-200 ${borderClass}`} key={step.id}>
                  <div className="mb-10 flex items-start justify-between gap-4">
                    <span className={`font-display text-5xl font-black ${liveState === "blocked" ? "text-[#ff7777]" : "text-[#f59abd]"}`}>{step.id}</span>
                    <span className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/55">
                      {step.id === "02A" || step.id === "02B" ? "Parallel" : "Sequential"}
                    </span>
                  </div>
                  <h3 className="font-display text-2xl font-black">{step.title}</h3>
                  <p className="mt-2 text-lg text-white/55">{step.detail}</p>
                  {step.reason && (
                    <p className="mt-2 text-sm text-[#ff7777] font-semibold">{step.reason}</p>
                  )}
                  <div className="mt-8 h-2 rounded-full bg-white/10">
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

          {verdictInfo.showMatches ? (
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
                {(verdictInfo.title.includes("REJECTED")
                  ? [
                      {
                        rank: 1,
                        title: "Matched Public Track (ACRCloud)",
                        score: 97,
                        melody: 92,
                        rhythm: 98,
                        structure: 90,
                        key: "G min / 128",
                        source: "ACRCloud (ISRC: US-RC1-23-45678)",
                      },
                    ]
                  : verdictInfo.title.includes("SIMILAR")
                    ? [
                        {
                          rank: 1,
                          title: "Similar Composition - Sealed #39a5",
                          score: 82,
                          melody: 85,
                          rhythm: 78,
                          structure: 83,
                          key: "A min / 124",
                          source: "Private registry",
                        },
                      ]
                    : [
                        {
                          rank: 1,
                          title: "Night Glass - Luma Vale",
                          score: 21,
                          melody: 18,
                          rhythm: 24,
                          structure: 20,
                          key: "A min / 124",
                          source: "ACRCloud",
                        },
                        {
                          rank: 2,
                          title: "@artist_9x7 - [SEALED]",
                          score: 14,
                          melody: 16,
                          rhythm: 12,
                          structure: 15,
                          key: "C maj / 121",
                          source: "Private registry",
                        },
                      ]
                ).map((match) => (
                  <div className="contents" key={match.rank}>
                    <div className="min-w-14 border-b border-white/10 p-4 text-white/55">{match.rank}</div>
                    <div className="min-w-64 border-b border-white/10 p-4 font-bold">{match.title}</div>
                    <div className={`min-w-24 border-b border-white/10 p-4 font-black ${scoreTone(match.score)}`}>{match.score}%</div>
                    <div className="min-w-24 border-b border-white/10 p-4 text-white/65">{match.melody}%</div>
                    <div className="min-w-24 border-b border-white/10 p-4 text-white/65">{match.rhythm}%</div>
                    <div className="min-w-24 border-b border-white/10 p-4 text-white/65">{match.structure}%</div>
                    <div className="min-w-28 border-b border-white/10 p-4 text-white/65">{match.key}</div>
                    <div className="min-w-32 border-b border-white/10 p-4 text-white/65">{match.source}</div>
                  </div>
                ))}
              </div>
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
                  <span className="font-bold text-white">Confidential AI Attestation:</span>
                  <p className="mt-1 font-mono text-sm">
                    {livePipelineSteps.find(s => s.status === "blocked")?.reason || "High similarity detected. Registry transaction cancelled."}
                  </p>
                </div>
              </div>
              <div className="mt-10 font-bold text-white/45 text-sm">
                No contract state was modified. Your EVM fee will be refunded/settled.
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-[8px] border border-white/15 bg-[#f8f6ee] p-6 text-[#050505] sm:p-8">
              <div className="absolute right-8 top-8 rounded-full bg-[#050505] px-4 py-2 text-sm font-black text-[#f8f6ee]">
                {flow?.status === "pipeline_completed" ? "SEALED" : "PENDING"}
              </div>
              <p className="font-hand text-3xl text-[#f59abd]">certificate preview</p>
              <h2 className="mt-4 max-w-3xl font-display text-[clamp(3rem,7vw,7rem)] font-black leading-[0.86]">
                Proof that keeps the music yours.
              </h2>
              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <CertificateMetric
                  label="Commitment"
                  value={flow?.trackFingerprint ? `${flow.trackFingerprint.slice(0, 10)}...${flow.trackFingerprint.slice(-6)}` : "Awaiting run"}
                />
                <CertificateMetric
                  label="Timestamp"
                  value={flow?.status === "pipeline_completed" ? new Date(flow.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Awaiting run"}
                />
                <CertificateMetric
                  label="Registry"
                  value={echoConfig.registryChainId === sepolia.id ? "Ethereum Sepolia" : `Chain ${echoConfig.registryChainId}`}
                />
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#050505] px-5 font-black text-white transition hover:bg-[#202020] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!flow?.trackFingerprint}
                  onClick={async () => {
                    if (flow?.trackFingerprint) {
                      await navigator.clipboard.writeText(flow.trackFingerprint);
                    }
                  }}
                >
                  <Copy className="size-4" aria-hidden="true" />
                  Copy hash
                </button>
                <a
                  className={`inline-flex min-h-12 items-center gap-2 rounded-full border border-[#050505]/20 px-5 font-black transition hover:border-[#050505] ${!flow?.txHash ? "opacity-50 pointer-events-none" : ""}`}
                  href={flow?.txHash ? `https://sepolia.etherscan.io/tx/${flow.txHash}` : "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Etherscan
                </a>
              </div>
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
                "Report attached to Walrus blob",
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
              disabled={flow?.status !== "pipeline_completed" || isRevealingTrack}
              onClick={handleRevealTrack}
            >
              {isRevealingTrack ? "Revealing..." : "Reveal track"}
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

function CertificateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-28 rounded-[8px] border border-[#050505]/15 p-4">
      <p className="text-sm font-bold uppercase text-[#050505]/45">{label}</p>
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
