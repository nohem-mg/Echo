import { useEffect, useMemo, useState } from "react";
import { IDKit, orbLegacy } from "@worldcoin/idkit-core";
import QRCode from "qrcode";
import { keccak256, type Abi } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { useAccount, useSignMessage, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import registryAbi from "@/lib/abi/Registry.json";
import { buildAgentkitHeader } from "@/lib/services/agentkit";
import { formatApiError, readApiErrorBody } from "@/lib/utils/api-error";
import { createAudioFingerprint, stripAudioExtension } from "@/lib/utils/audio";
import { echoConfig, isWorldConfigured } from "@/lib/config";
import { toBytes32Hex } from "@/lib/utils/encoding";
import { getFlowStatusMessage, getVerdictInfo } from "@/lib/flow/flow-status";
import { mockReports } from "@/lib/flow/mock-reports";
import { buildDisplaySteps } from "@/lib/flow/pipeline-display";
import { normalizeReportMatches, resolveActiveReport } from "@/lib/flow/report";
import { echoSounds } from "@/lib/sound-design";
import { requestSoundCloudToken, type SoundCloudPublishResponse, type SoundCloudPublishState } from "@/lib/services/soundcloud";
import type { EchoFlow, EchoPayment, EchoPipelineStep, PaymentCreateResponse, TrackUploadResponse, WorldVerification } from "@/lib/types";
import { useEchoSoundEffects } from "@/lib/hooks/use-echo-sound-effects";
import { useFlowHistory } from "@/lib/hooks/use-flow-history";
import { createMockProof, getProofNullifier, type WorldQrState } from "@/lib/services/world-id";

const registryContractAbi = registryAbi.abi as Abi;

type EphemeralOwner = {
  walletAddress?: `0x${string}`;
  account: PrivateKeyAccount;
};

/**
 * Orchestrates the full Echo seal flow: track upload, World ID verification,
 * payment, confidential pipeline run (live CRE polling or local simulation),
 * on-chain reveal, and SoundCloud publishing.
 */
export function useEchoFlow() {
  // Track & upload
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioName, setAudioName] = useState("");
  const [trackFingerprint, setTrackFingerprint] = useState("");

  // Flow & verification
  const [flow, setFlow] = useState<EchoFlow | null>(null);
  const [verification, setVerification] = useState<WorldVerification>({ status: "idle" });
  const [worldQr, setWorldQr] = useState<WorldQrState | null>(null);

  // Payment
  const [payment, setPayment] = useState<EchoPayment>({ status: "idle" });
  const [pendingQuote, setPendingQuote] = useState<PaymentCreateResponse | null>(null);

  // Pipeline
  const [pipelineStarted, setPipelineStarted] = useState(false);
  const [livePipelineSteps, setLivePipelineSteps] = useState<EchoPipelineStep[]>([]);
  const [pipelineProgressStatus, setPipelineProgressStatus] = useState("");
  const [isStartingPipeline, setIsStartingPipeline] = useState(false);
  const [creDisabled, setCreDisabled] = useState(false);

  // Post-seal actions
  const [soundCloudTitle, setSoundCloudTitle] = useState("");
  const [soundCloudPublish, setSoundCloudPublish] = useState<SoundCloudPublishState>({ status: "idle" });
  const [ephemeralOwner, setEphemeralOwner] = useState<EphemeralOwner | null>(null);

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync: writeRegistryContract, isPending: isWritingRegistry } = useWriteContract();
  const { entries: historyEntries, addOrUpdate: addOrUpdateHistory } = useFlowHistory(address);

  // ── Derived state ────────────────────────────────────────────────────────

  const canVerify = Boolean(audioName && trackFingerprint && verification.status !== "pending");
  const canPay = Boolean(audioName && verification.status === "verified" && verification.flow.id && payment.status !== "pending" && payment.status !== "paid");
  const canStartAnalysis = Boolean(payment.status === "paid" && flow?.id && audioFile && !pipelineStarted && !isStartingPipeline);

  const shouldUseMockReport = Boolean(echoConfig.mockWorldEnabled && flow?.worldMode === "mock");
  const activeReport = resolveActiveReport(
    flow,
    livePipelineSteps,
    shouldUseMockReport && flow?.status === "pipeline_completed" ? mockReports.CLEAN : undefined,
  );
  const reportMatches = useMemo(() => normalizeReportMatches(activeReport), [activeReport]);
  const publicReferences = useMemo(() => activeReport?.public_references ?? [], [activeReport]);

  const hasRegistrySeal = Boolean(flow?.status === "pipeline_completed" && flow.registryTxHash && flow.registryTrackId);
  const isCleanAndSealed = Boolean(hasRegistrySeal && activeReport?.verdict === "CLEAN");
  const certificateTrackId = flow?.registryTrackId;
  const certificateTxHash = flow?.registryTxHash;
  const blockedStepReason = livePipelineSteps.find((step) => step.status === "blocked")?.reason;

  const canPublishToSoundCloud = Boolean(
    isCleanAndSealed &&
    flow?.id &&
    (soundCloudTitle.trim() || audioName) &&
    soundCloudPublish.status !== "publishing",
  );

  const displaySteps = useMemo(() => buildDisplaySteps(livePipelineSteps), [livePipelineSteps]);

  const flowStatus = useMemo(
    () =>
      getFlowStatusMessage({
        progressStatus: pipelineProgressStatus,
        flow,
        pipelineStarted,
        payment,
        verification,
        audioName,
        trackFingerprint,
      }),
    [audioName, flow, payment, pipelineProgressStatus, pipelineStarted, trackFingerprint, verification],
  );

  const verdictInfo = useMemo(
    () => getVerdictInfo({ flow, pipelineStarted, livePipelineSteps, activeReport, hasRegistrySeal }),
    [activeReport, flow, hasRegistrySeal, pipelineStarted, livePipelineSteps],
  );

  useEchoSoundEffects(flow, livePipelineSteps, pipelineStarted, hasRegistrySeal);

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    echoSounds.installAudioUnlockListeners();
  }, []);

  // Real-payment path: watch the Sepolia receipt for a pending payment hash.
  const pendingPaymentHash = payment.status === "pending" ? payment.hash : undefined;
  const pendingPaymentReference = payment.status === "pending" ? payment.reference : undefined;
  const { data: paymentReceipt, error: paymentReceiptError } = useWaitForTransactionReceipt({
    hash: pendingPaymentHash,
    chainId: sepolia.id,
    query: {
      enabled: Boolean(pendingPaymentHash),
    },
  });

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
        echoSounds.paymentSuccess();
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
              ? "Pipeline completed: Network seal confirmed on Sepolia"
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

    const step01 = livePipelineSteps.find((s) => s.stepKey === "01");
    const step02A = livePipelineSteps.find((s) => s.stepKey === "02A");
    const step02B = livePipelineSteps.find((s) => s.stepKey === "02B");
    const step03 = livePipelineSteps.find((s) => s.stepKey === "03");
    const step04 = livePipelineSteps.find((s) => s.stepKey === "04");

    if (step01 && step01.status === "running") {
      timer = setTimeout(() => {
        setLivePipelineSteps((prev) => prev.map((s) => {
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
          setLivePipelineSteps((prev) => prev.map((s) => {
            if (s.stepKey === "02A") {
              return { ...s, status: "blocked", progress: 95, meta: "Match: 97%", reason: "Plagiarism detected (ACRCloud: 97%)" };
            }
            if (s.stepKey === "02B") {
              return { ...s, status: "queued", progress: 0 };
            }
            return s;
          }));
          setFlow((prev) => prev ? { ...prev, status: "pipeline_blocked", report: mockReports.REJECTED } : null);
          setPipelineProgressStatus("STOP: Plagiarism detected. No on-chain seal was created.");
        } else if (isSimilar) {
          setLivePipelineSteps((prev) => prev.map((s) => {
            if (s.stepKey === "02A") {
              return { ...s, status: "done", progress: 100, meta: "Match: 14%" };
            }
            if (s.stepKey === "02B") {
              return { ...s, status: "blocked", progress: 85, meta: "Match: 82%", reason: "Composition similarity detected (Algo MIDI: 82%)" };
            }
            return s;
          }));
          setFlow((prev) => prev ? { ...prev, status: "pipeline_blocked", report: mockReports.SIMILAR } : null);
          setPipelineProgressStatus("STOP: Composition similarity detected. No on-chain seal was created.");
        } else {
          setLivePipelineSteps((prev) => prev.map((s) => {
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
        setLivePipelineSteps((prev) => prev.map((s) => {
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
        setLivePipelineSteps((prev) => prev.map((s) => {
          if (s.stepKey === "04") {
            return { ...s, status: "done", progress: 100, meta: "CLEAN" };
          }
          return s;
        }));
        setFlow((prev) =>
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
        setPipelineProgressStatus("Mock pipeline complete. Demo Network seal available.");
      }, 2500);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [pipelineStarted, flow, livePipelineSteps, audioName, trackFingerprint, creDisabled]);

  // Persist flow progress into the per-wallet local history.
  useEffect(() => {
    if (flow && address) addOrUpdateHistory(flow);
  }, [flow, address, addOrUpdateHistory]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function getOrDeriveOwnerKey() {
    if (ephemeralOwner && ephemeralOwner.walletAddress === address) {
      return ephemeralOwner.account;
    }
    setPipelineProgressStatus("Signing derivation message to generate ephemeral owner key...");
    const sig = await signMessageAsync({ message: "Sign to derive Echo ephemeral owner key" });
    const privateKey = keccak256(sig);
    const account = privateKeyToAccount(privateKey);
    setEphemeralOwner({ walletAddress: address, account });
    return account;
  }

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
    setSoundCloudTitle(stripAudioExtension(file.name));
    setSoundCloudPublish({ status: "idle" });

    try {
      setTrackFingerprint(await createAudioFingerprint(file));
      echoSounds.trackUpload();
    } catch {
      setVerification({
        status: "error",
        error: "Could not compute local track fingerprint",
      });
    }
  }

  async function restoreFlow(flowId: string) {
    try {
      const res = await fetch(`/api/flows/${flowId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { flow: EchoFlow; pipeline: EchoPipelineStep[] };
      setFlow(data.flow);
      setAudioFile(null);
      setAudioName(data.flow.trackName);
      setSoundCloudTitle(stripAudioExtension(data.flow.trackName));
      setLivePipelineSteps(data.pipeline ?? []);
      setPipelineStarted(true);
      setVerification({ status: "idle" });
      setPayment({ status: "idle" });
      setPendingQuote(null);
    } catch { }
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
        echoSounds.verifySuccess();
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
      echoSounds.verifySuccess();
    } catch (error) {
      setWorldQr(null);
      setVerification({
        status: "error",
        error: error instanceof Error ? error.message : "World ID verification failed",
      });
    }
  }

  // Demo build: the Sepolia fee payment is mocked — the backend flow still
  // advances through payments/create + payments/confirm, but no wallet
  // transaction is sent. The receipt-watching effects above cover the real
  // payment path when it is re-enabled.
  async function handlePayAndStart() {
    if (!audioName || verification.status !== "verified" || payment.status === "pending" || payment.status === "paid") {
      return;
    }

    const mockHash = `0x${"ab".repeat(32)}` as `0x${string}`;
    const mockReference = `mock-ref-${crypto.randomUUID()}`;
    const flowId = verification.flow.id;

    try {
      const paymentRequest = (await fetch("/api/payments/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowId }),
      }).then((response) => {
        if (!response.ok) {
          throw new Error("Could not create payment request");
        }

        return response.json();
      })) as PaymentCreateResponse;

      if (paymentRequest.flow) {
        setFlow(paymentRequest.flow);
      }

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

        if (confirmResponse.ok) {
          const confirmed = (await confirmResponse.json()) as { flow?: EchoFlow };
          if (confirmed.flow) {
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

  async function handleUploadAndStart() {
    if (payment.status !== "paid" || !flow?.id || !audioFile || pipelineStarted || isStartingPipeline) {
      return;
    }

    await startPipelineForFlow(flow.id, audioFile);
  }

  async function handlePrimaryAction() {
    if (payment.status !== "paid") {
      await handlePayAndStart();
      return;
    }

    await handleUploadAndStart();
  }

  async function startPipelineForFlow(flowId: string, file: File) {
    try {
      setIsStartingPipeline(true);
      setPipelineProgressStatus("Uploading track for confidential analysis...");
      const formData = new FormData();
      formData.append("flowId", flowId);
      formData.append("fingerprint", trackFingerprint);
      formData.append("file", file);

      const uploadResponse = await fetch("/api/tracks/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorBody = await readApiErrorBody(uploadResponse);
        throw new Error(formatApiError(errorBody, `Failed to upload track (HTTP ${uploadResponse.status})`));
      }

      const uploadData = (await uploadResponse.json()) as TrackUploadResponse;
      setFlow(uploadData.flow);
      setLivePipelineSteps(uploadData.pipeline);
      setPipelineProgressStatus("Deriving owner key...");
      const ownerAccount = await getOrDeriveOwnerKey();

      // Pre-sign AgentKit credential for /api/report (valid 1h — covers full pipeline duration).
      // Only triggered when NEXT_PUBLIC_ECHO_AGENTKIT_ENABLED=true (production/staging).
      let agentkitHeader: string | undefined;
      if (address && process.env.NEXT_PUBLIC_ECHO_AGENTKIT_ENABLED === "true") {
        setPipelineProgressStatus("Signing AgentKit access credential...");
        agentkitHeader = await buildAgentkitHeader(address, (msg) => signMessageAsync({ message: msg }));
      }

      setPipelineProgressStatus("Starting CRE handoff...");

      const startResponse = await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flowId,
          trackId: uploadData.track.id,
          owner: ownerAccount.address,
          ...(agentkitHeader ? { agentkitHeader } : {}),
        }),
      });

      if (!startResponse.ok) {
        const errorBody = await readApiErrorBody(startResponse);
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
        echoSounds.pipelineStart();
      } else {
        setPipelineStarted(true);
        setCreDisabled(false);
        setPipelineProgressStatus("Confidential analysis pipeline running...");
        echoSounds.pipelineStart();
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
      const ownerAccount = await getOrDeriveOwnerKey();

      setPipelineProgressStatus("Signing reveal authorization...");
      const profileHash = toBytes32Hex(activeReport?.submitted_track?.fingerprint ?? flow?.trackFingerprint ?? "pending-profile");

      const cleanTrackId = certificateTrackId.toLowerCase().replace("0x", "");
      const cleanProfileHash = profileHash.toLowerCase().replace("0x", "");
      const encoded = `0x${cleanTrackId}${cleanProfileHash}` as `0x${string}`;
      const digest = keccak256(encoded);

      const ownerSig = await ownerAccount.signMessage({
        message: { raw: digest },
      });

      setPipelineProgressStatus("Sending revealTrack transaction to Ethereum Sepolia...");

      const txHash = await writeRegistryContract({
        address: echoConfig.registryAddress as `0x${string}`,
        abi: registryContractAbi,
        functionName: "revealTrack",
        args: [certificateTrackId, profileHash, ownerSig],
      });

      setPipelineProgressStatus(`Track revealed on-chain! Tx: ${txHash.slice(0, 12)}...`);
    } catch (error) {
      console.error("On-chain reveal failed:", error);
      setPipelineProgressStatus(`On-chain reveal failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handlePublishToSoundCloud() {
    if (!flow?.id || !isCleanAndSealed) {
      setSoundCloudPublish({ status: "error", error: "SoundCloud publish opens after a CLEAN Network seal." });
      return;
    }

    const title = soundCloudTitle.trim() || stripAudioExtension(audioName);

    if (!title) {
      setSoundCloudPublish({ status: "error", error: "Set a title before publishing." });
      return;
    }

    setSoundCloudPublish({ status: "publishing" });

    try {
      const accessToken = await requestSoundCloudToken();

      const response = await fetch("/api/soundcloud/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flowId: flow.id,
          title,
          description: "",
          privacy: "private",
          accessToken,
        }),
      });

      if (!response.ok) {
        const errorBody = await readApiErrorBody(response);
        throw new Error(formatApiError(errorBody, `SoundCloud publish failed (HTTP ${response.status})`));
      }

      const result = (await response.json()) as SoundCloudPublishResponse;
      setSoundCloudPublish({ status: "published", response: result });
    } catch (error) {
      setSoundCloudPublish({
        status: "error",
        error: error instanceof Error ? error.message : "SoundCloud publish failed",
      });
    }
  }

  return {
    // wallet
    isConnected,

    // track
    audioFile,
    audioName,
    trackFingerprint,
    handleAudioFile,

    // flow
    flow,
    flowStatus,
    historyEntries,
    restoreFlow,

    // verification
    verification,
    canVerify,
    handleVerifyWorld,
    worldQr,
    dismissWorldQr: () => setWorldQr(null),

    // payment & pipeline
    payment,
    canPay,
    canStartAnalysis,
    isStartingPipeline,
    pipelineStarted,
    handlePrimaryAction,
    displaySteps,
    livePipelineSteps,
    blockedStepReason,

    // report & verdict
    activeReport,
    reportMatches,
    publicReferences,
    verdictInfo,

    // seal & post-seal actions
    hasRegistrySeal,
    isCleanAndSealed,
    certificateTrackId,
    certificateTxHash,
    isWritingRegistry,
    handleRevealTrack,
    canPublishToSoundCloud,
    soundCloudPublish,
    handlePublishToSoundCloud,
  };
}
