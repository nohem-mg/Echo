import { promises as fs } from "node:fs";
import path from "node:path";
import type { EchoFlow, EchoPipelineStep, EchoTrack } from "@/lib/types";
import {
  buildInitialPipelineSteps,
  FLOW_STATUSES,
  FlowStoreError,
  PIPELINE_STATUSES,
  sortPipelineSteps,
  createFlowId,
  type AssignPaymentInput,
  type ConfirmPaymentInput,
  type ConfirmRegistryRegistrationInput,
  type CreateFlowInput,
  type FlowFile,
  type FlowStorage,
  type InitializePipelineInput,
  type PersistenceHealthCounts,
  type PipelineOutcomeInput,
  type PipelineOutcomeStatus,
  type SaveTrackInput,
  type UpdatePipelineStepInput,
} from "./shared";

const FLOW_STORE_FILE = path.join(process.cwd(), ".data", "echo-flows.json");

function assertLocalFileStoreAvailable() {
  if (process.env.VERCEL) {
    throw new FlowStoreError("Missing DATABASE_URL. Vercel needs a durable Postgres database for Echo flow persistence.", 500);
  }
}

async function readFlowFile(): Promise<FlowFile> {
  try {
    const contents = await fs.readFile(FLOW_STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as FlowFile;
    return {
      flows: Array.isArray(parsed.flows) ? parsed.flows.filter(isEchoFlow) : [],
      tracks: Array.isArray(parsed.tracks) ? parsed.tracks.filter(isEchoTrack) : [],
      pipelineSteps: Array.isArray(parsed.pipelineSteps) ? parsed.pipelineSteps.filter(isEchoPipelineStep) : [],
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { flows: [], tracks: [], pipelineSteps: [] };
    }

    throw error;
  }
}

async function writeFlowFile(file: FlowFile) {
  await fs.mkdir(path.dirname(FLOW_STORE_FILE), { recursive: true });
  await fs.writeFile(FLOW_STORE_FILE, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

async function updateFlowFile(flowId: string, updater: (flow: EchoFlow) => EchoFlow) {
  const file = await readFlowFile();
  const index = file.flows.findIndex((flow) => flow.id === flowId);

  if (index < 0) {
    throw new FlowStoreError("Flow not found", 404);
  }

  const updated = {
    ...updater(file.flows[index]),
    updatedAt: new Date().toISOString(),
  };

  file.flows[index] = updated;
  await writeFlowFile(file);
  return updated;
}

export const fileStorage: FlowStorage = {
  async health(): Promise<PersistenceHealthCounts> {
    const file = await readFlowFile();
    return {
      flowCount: file.flows.length,
      trackCount: file.tracks.length,
      pipelineStepCount: file.pipelineSteps.length,
    };
  },

  async createOrReuseFlow(input: CreateFlowInput): Promise<EchoFlow> {
    assertLocalFileStoreAvailable();
    const file = await readFlowFile();

    // Block a different identity from submitting a track whose analysis already completed.
    const alreadyCompleted = file.flows.find(
      (flow) =>
        flow.trackFingerprint === input.trackFingerprint &&
        flow.status === "pipeline_completed" &&
        flow.nullifierHash !== input.nullifierHash,
    );
    if (alreadyCompleted) {
      throw new FlowStoreError("This track is already registered by another artist", 409);
    }

    const existing = file.flows.find((flow) => flow.nullifierHash === input.nullifierHash && flow.trackFingerprint === input.trackFingerprint);

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const flow: EchoFlow = {
      id: createFlowId(),
      nullifierHash: input.nullifierHash,
      trackName: input.trackName,
      trackFingerprint: input.trackFingerprint,
      worldMode: input.worldMode,
      status: "world_verified",
      createdAt: now,
      updatedAt: now,
    };

    file.flows.push(flow);
    await writeFlowFile(file);
    return flow;
  },

  async getFlow(flowId: string): Promise<EchoFlow | null> {
    assertLocalFileStoreAvailable();
    const file = await readFlowFile();
    return file.flows.find((flow) => flow.id === flowId) ?? null;
  },

  async setPaymentReference(input: AssignPaymentInput): Promise<EchoFlow> {
    assertLocalFileStoreAvailable();
    return updateFlowFile(input.flowId, (flow) => ({
      ...flow,
      paymentReference: input.paymentReference,
      paymentAmountEth: input.paymentAmountEth,
      paymentChainId: input.paymentChainId,
      status: "payment_requested",
    }));
  },

  async setPaymentConfirmed(input: ConfirmPaymentInput): Promise<EchoFlow> {
    assertLocalFileStoreAvailable();
    return updateFlowFile(input.flowId, (flow) => ({
      ...flow,
      txHash: input.txHash,
      walletAddress: input.walletAddress ?? flow.walletAddress,
      status: "payment_confirmed",
    }));
  },

  async updateRegistryRegistration(input: ConfirmRegistryRegistrationInput, includeTrackId: boolean): Promise<EchoFlow> {
    assertLocalFileStoreAvailable();
    return updateFlowFile(input.flowId, (flow) => ({
      ...flow,
      commitmentHash: input.commitmentHash,
      registryRef: input.registryRef,
      ...(includeTrackId ? { registryTrackId: input.registryTrackId } : {}),
    }));
  },

  async markFlowError(flowId: string, error: string): Promise<EchoFlow | null> {
    assertLocalFileStoreAvailable();
    return updateFlowFile(flowId, (flow) => ({
      ...flow,
      status: "error",
      error,
    }));
  },

  async getTrackForFlow(flowId: string): Promise<EchoTrack | null> {
    assertLocalFileStoreAvailable();
    const file = await readFlowFile();
    return file.tracks.find((track) => track.flowId === flowId) ?? null;
  },

  async insertTrack(input: SaveTrackInput): Promise<EchoTrack> {
    assertLocalFileStoreAvailable();
    const file = await readFlowFile();
    const now = new Date().toISOString();
    const track: EchoTrack = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    file.tracks.push(track);
    file.flows = file.flows.map((storedFlow) => {
      if (storedFlow.id !== input.flowId) {
        return storedFlow;
      }

      return {
        ...storedFlow,
        status: ["pipeline_started", "pipeline_completed", "pipeline_blocked", "error"].includes(storedFlow.status) ? storedFlow.status : "track_uploaded",
        updatedAt: now,
      };
    });
    await writeFlowFile(file);
    return track;
  },

  async persistPipelineReset(flowId: string, _trackId: string, steps: EchoPipelineStep[]): Promise<EchoPipelineStep[]> {
    assertLocalFileStoreAvailable();
    const now = new Date().toISOString();
    const file = await readFlowFile();
    file.pipelineSteps = file.pipelineSteps.filter((step) => step.flowId !== flowId);
    file.pipelineSteps.push(...steps);
    file.flows = file.flows.map((storedFlow) =>
      storedFlow.id === flowId
        ? {
            ...storedFlow,
            status: "pipeline_started",
            error: undefined,
            report: undefined,
            commitmentHash: undefined,
            registryRef: undefined,
            registryTrackId: undefined,
            registryTxHash: undefined,
            updatedAt: now,
          }
        : storedFlow,
    );
    await writeFlowFile(file);
    return steps;
  },

  async initializePipeline(input: InitializePipelineInput): Promise<EchoPipelineStep[]> {
    assertLocalFileStoreAvailable();
    const file = await readFlowFile();
    const existingSteps = file.pipelineSteps.filter((step) => step.flowId === input.flowId);

    if (existingSteps.length > 0) {
      if (input.ownerAddress) {
        const now = new Date().toISOString();
        file.flows = file.flows.map((storedFlow) => {
          if (storedFlow.id !== input.flowId) {
            return storedFlow;
          }

          return {
            ...storedFlow,
            ownerAddress: input.ownerAddress as `0x${string}`,
            updatedAt: now,
          };
        });
        await writeFlowFile(file);
      }

      return existingSteps.sort(sortPipelineSteps);
    }

    const now = new Date().toISOString();
    const pipelineSteps = buildInitialPipelineSteps(input.flowId, input.trackId, now);

    file.pipelineSteps.push(...pipelineSteps);
    file.flows = file.flows.map((storedFlow) => {
      if (storedFlow.id !== input.flowId) {
        return storedFlow;
      }

      return {
        ...storedFlow,
        status: ["pipeline_completed", "pipeline_blocked", "error"].includes(storedFlow.status) ? storedFlow.status : "pipeline_started",
        ownerAddress: input.ownerAddress ? (input.ownerAddress as `0x${string}`) : storedFlow.ownerAddress,
        updatedAt: now,
      };
    });
    await writeFlowFile(file);
    return pipelineSteps;
  },

  async getPipelineSteps(flowId: string): Promise<EchoPipelineStep[]> {
    assertLocalFileStoreAvailable();
    const file = await readFlowFile();
    return file.pipelineSteps.filter((step) => step.flowId === flowId).sort(sortPipelineSteps);
  },

  async updatePipelineStep(input: UpdatePipelineStepInput): Promise<EchoPipelineStep> {
    assertLocalFileStoreAvailable();
    const file = await readFlowFile();
    const index = file.pipelineSteps.findIndex((step) => step.flowId === input.flowId && step.stepKey === input.stepKey);

    if (index < 0) {
      throw new FlowStoreError("Pipeline step not found", 404);
    }

    const current = file.pipelineSteps[index];
    const updated: EchoPipelineStep = {
      ...current,
      status: input.status ?? current.status,
      progress: typeof input.progress === "number" ? input.progress : current.progress,
      meta: input.meta === null ? undefined : input.meta ?? current.meta,
      reason: input.reason === null ? undefined : input.reason ?? current.reason,
      detail: input.detail ?? current.detail,
      updatedAt: new Date().toISOString(),
    };

    file.pipelineSteps[index] = updated;
    await writeFlowFile(file);
    return updated;
  },

  async updatePipelineOutcome(existing: EchoFlow, status: PipelineOutcomeStatus, input: PipelineOutcomeInput): Promise<EchoFlow> {
    assertLocalFileStoreAvailable();
    return updateFlowFile(existing.id, (flow) => ({
      ...flow,
      status,
      error: input.reason ?? (status === "error" ? flow.error ?? "Pipeline failed" : undefined),
      commitmentHash: input.clearOnChainHandoff
        ? undefined
        : input.commitmentHash ?? flow.commitmentHash,
      registryRef: input.clearOnChainHandoff ? undefined : input.registryRef ?? flow.registryRef,
      registryTrackId: input.clearOnChainHandoff
        ? undefined
        : input.registryTrackId ?? flow.registryTrackId,
      registryTxHash:
        input.clearOnChainHandoff || input.clearRegistryTxHash
          ? undefined
          : input.registryTxHash ?? flow.registryTxHash,
      report: input.report ?? flow.report,
    }));
  },
};

// ── Type guards for file contents ────────────────────────────────────────────

function isEchoFlow(value: unknown): value is EchoFlow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const flow = value as Partial<EchoFlow>;
  return Boolean(flow.id && flow.nullifierHash && flow.trackName && flow.trackFingerprint && flow.status && FLOW_STATUSES.has(flow.status));
}

function isEchoTrack(value: unknown): value is EchoTrack {
  if (!value || typeof value !== "object") {
    return false;
  }

  const track = value as Partial<EchoTrack>;
  return Boolean(
    track.id &&
      track.flowId &&
      track.fileName &&
      track.contentType &&
      typeof track.sizeBytes === "number" &&
      track.fingerprint &&
      (track.storageProvider === "local_file" || track.storageProvider === "vercel_blob"),
  );
}

function isEchoPipelineStep(value: unknown): value is EchoPipelineStep {
  if (!value || typeof value !== "object") {
    return false;
  }

  const step = value as Partial<EchoPipelineStep>;
  return Boolean(
    step.id &&
      step.flowId &&
      step.trackId &&
      step.stepKey &&
      step.label &&
      step.detail &&
      (step.phase === "sequential" || step.phase === "parallel") &&
      typeof step.position === "number" &&
      step.status &&
      PIPELINE_STATUSES.has(step.status),
  );
}
