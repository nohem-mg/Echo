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
import { useAccount, useChainId, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from "wagmi";
import { sepolia } from "wagmi/chains";
import { echoConfig, isWorldConfigured } from "@/lib/config";
import type { EchoFlow, EchoPayment, PaymentCreateResponse, WorldVerification } from "@/lib/types";

type StepState = "idle" | "active" | "done" | "blocked";

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

  async function handleAudioSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setAudioName(file?.name ?? "");
    setTrackFingerprint("");
    setFlow(null);
    setVerification({ status: "idle" });
    setPipelineStarted(false);
    setPayment({ status: "idle" });
    setPendingQuote(null);

    if (!file) {
      return;
    }

    try {
      setTrackFingerprint(await createAudioFingerprint(file));
    } catch {
      setVerification({
        status: "error",
        error: "Could not compute local track fingerprint",
      });
    }
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
        throw new Error("Backend rejected World ID proof");
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

            <label className="group block cursor-pointer rounded-[8px] border border-dashed border-white/25 bg-white/[0.03] p-6 transition hover:border-[#f59abd] hover:bg-[#f59abd]/10">
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
                  <span className="block break-words font-display text-4xl font-black text-white">{selectedLabel}</span>
                  <span className="mt-3 block text-base text-white/55">Client-side encrypted audio, then confidential comparison.</span>
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
                disabled={!canPay || isSendingTransaction || isConfirmingTransaction || isSwitchingChain}
                onClick={handlePayAndStart}
                type="button"
              >
                <ShieldCheck className="size-5" aria-hidden="true" />
                {payment.status === "paid"
                  ? "Fee paid"
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
              {verification.status === "error" ? <span className="mt-1 block text-[#ff7777]">{verification.error}</span> : null}
              {payment.status === "error" ? <span className="mt-1 block text-[#ff7777]">{payment.error}</span> : null}
            </div>

            <div className="mt-6 rounded-[8px] border border-white/10">
              {pipelineSteps.map((step, index) => (
                <PipelineRow key={step.id} step={step} state={getStepState(index, Boolean(audioName), pipelineStarted)} />
              ))}
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
            <p className="font-hand text-3xl text-[#9ef7c9]">the loop, but sealed</p>
            <h2 className="mt-4 max-w-3xl font-display text-[clamp(3rem,7vw,6.5rem)] font-black leading-[0.9]">
              One private run. One public timestamp.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {pipelineSteps.map((step, index) => (
              <div className="min-h-56 rounded-[8px] border border-white/15 bg-[#080808] p-5" key={step.id}>
                <div className="mb-10 flex items-start justify-between gap-4">
                  <span className="font-display text-5xl font-black text-[#f59abd]">{step.id}</span>
                  <span className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/55">{index === 1 || index === 2 ? "Parallel" : "Sequential"}</span>
                </div>
                <h3 className="font-display text-2xl font-black">{step.title}</h3>
                <p className="mt-2 text-lg text-white/55">{step.detail}</p>
                <div className="mt-8 h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#9ef7c9]" style={{ width: `${Math.max(18, 100 - index * 16)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="report" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-hand text-3xl text-[#fff7cf]">verdict board</p>
              <h2 className="mt-3 font-display text-[clamp(2.8rem,6vw,6rem)] font-black leading-[0.9]">CLEAN, with traces.</h2>
            </div>
            <div className="rounded-full border border-[#9ef7c9]/60 bg-[#9ef7c9]/10 px-5 py-3 font-black text-[#9ef7c9]">Best match 41%</div>
          </div>

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
              {matches.map((match) => (
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
        </div>
      </section>

      <section id="seal" className="px-4 pb-32 pt-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1fr_0.82fr] lg:items-stretch">
          <div className="relative overflow-hidden rounded-[8px] border border-white/15 bg-[#f8f6ee] p-6 text-[#050505] sm:p-8">
            <div className="absolute right-8 top-8 rounded-full bg-[#050505] px-4 py-2 text-sm font-black text-[#f8f6ee]">SEALED</div>
            <p className="font-hand text-3xl text-[#f59abd]">certificate preview</p>
            <h2 className="mt-4 max-w-3xl font-display text-[clamp(3rem,7vw,7rem)] font-black leading-[0.86]">
              Proof that keeps the music yours.
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <CertificateMetric label="Commitment" value="0x8F...21C9" />
              <CertificateMetric label="Timestamp" value="Jun 13, 2026" />
              <CertificateMetric label="Registry" value={echoConfig.registryChainId === sepolia.id ? "Ethereum Sepolia" : `Chain ${echoConfig.registryChainId}`} />
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#050505] px-5 font-black text-white transition hover:bg-[#202020]">
                <Copy className="size-4" aria-hidden="true" />
                Copy hash
              </button>
              <button className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#050505]/20 px-5 font-black transition hover:border-[#050505]">
                <ExternalLink className="size-4" aria-hidden="true" />
                Etherscan
              </button>
            </div>
          </div>

          <div className="rounded-[8px] border border-white/15 bg-[#080808] p-6 sm:p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase text-white/45">Reveal queue</p>
                <h3 className="mt-1 font-display text-3xl font-black">Artist controls</h3>
              </div>
              <Disc3 className="size-10 text-[#8fd5ff]" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              {["SEALED entry is private", "Report attached to Walrus blob", "Reveal requires wallet signature"].map((item) => (
                <div className="flex min-h-14 items-center gap-3 rounded-[8px] border border-white/10 px-4" key={item}>
                  <span className="grid size-7 place-items-center rounded-full bg-[#9ef7c9] text-[#050505]">
                    <Check className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-bold text-white/75">{item}</span>
                </div>
              ))}
            </div>
            <button className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#8fd5ff] px-5 font-black text-[#050505] transition hover:bg-[#b8e5ff]">
              Reveal track
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
  step: (typeof pipelineSteps)[number];
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
