import type { EchoFlow, EchoFlowStatus, EchoPipelineStep, EchoPipelineStatus, EchoReport, EchoTrack } from "@/lib/types";

// ── Input types ────────────────────────────────────────────────────────────

export type CreateFlowInput = {
  nullifierHash: string;
  trackName: string;
  trackFingerprint: string;
  worldMode: "world" | "mock";
};

export type AssignPaymentInput = {
  flowId: string;
  paymentReference: string;
  paymentAmountEth: string;
  paymentChainId: number;
};

export type ConfirmPaymentInput = {
  flowId: string;
  paymentReference: string;
  txHash: `0x${string}`;
  walletAddress?: `0x${string}`;
};

export type ConfirmRegistryRegistrationInput = {
  flowId: string;
  registryTrackId: `0x${string}`;
  commitmentHash: `0x${string}`;
  registryRef: `0x${string}`;
};

export type SaveTrackInput = {
  id: string;
  flowId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  fingerprint: string;
  storageProvider: EchoTrack["storageProvider"];
  storageUrl?: string;
  storagePath?: string;
};

export type InitializePipelineInput = {
  flowId: string;
  trackId: string;
  ownerAddress?: string;
};

export type UpdatePipelineStepInput = {
  flowId: string;
  stepKey: string;
  status?: EchoPipelineStatus;
  progress?: number;
  meta?: string | null;
  reason?: string | null;
  detail?: string;
};

export type PipelineOutcomeInput = {
  flowId: string;
  report?: EchoReport;
  registryTrackId?: `0x${string}`;
  registryTxHash?: `0x${string}`;
  registryRef?: `0x${string}`;
  commitmentHash?: `0x${string}`;
  reason?: string;
  /** Drop stale on-chain seal fields before a fresh analysis/seal cycle. */
  clearOnChainHandoff?: boolean;
  /** Drop a previous registryTxHash when analysis completes without a new seal tx. */
  clearRegistryTxHash?: boolean;
};

export type PipelineOutcomeStatus = Extract<EchoFlowStatus, "pipeline_completed" | "pipeline_blocked" | "error">;

export type FlowFile = {
  flows: EchoFlow[];
  tracks: EchoTrack[];
  pipelineSteps: EchoPipelineStep[];
};

export type PersistenceHealthCounts = {
  flowCount: number;
  trackCount: number;
  pipelineStepCount: number;
};

/**
 * Persistence backend contract. Each method is the storage-specific half of a
 * public flow-store operation; shared validation and precondition checks live in
 * the public API layer (index.ts). Two implementations exist: Postgres and a
 * local-file/in-memory store.
 */
export interface FlowStorage {
  health(): Promise<PersistenceHealthCounts>;
  createOrReuseFlow(input: CreateFlowInput): Promise<EchoFlow>;
  getFlow(flowId: string): Promise<EchoFlow | null>;
  setPaymentReference(input: AssignPaymentInput): Promise<EchoFlow>;
  setPaymentConfirmed(input: ConfirmPaymentInput): Promise<EchoFlow>;
  updateRegistryRegistration(input: ConfirmRegistryRegistrationInput, includeTrackId: boolean): Promise<EchoFlow>;
  markFlowError(flowId: string, error: string): Promise<EchoFlow | null>;
  getTrackForFlow(flowId: string): Promise<EchoTrack | null>;
  insertTrack(input: SaveTrackInput): Promise<EchoTrack>;
  persistPipelineReset(flowId: string, trackId: string, steps: EchoPipelineStep[]): Promise<EchoPipelineStep[]>;
  initializePipeline(input: InitializePipelineInput): Promise<EchoPipelineStep[]>;
  getPipelineSteps(flowId: string): Promise<EchoPipelineStep[]>;
  updatePipelineStep(input: UpdatePipelineStepInput): Promise<EchoPipelineStep>;
  updatePipelineOutcome(existing: EchoFlow, status: PipelineOutcomeStatus, input: PipelineOutcomeInput): Promise<EchoFlow>;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const FLOW_STATUSES = new Set<EchoFlowStatus>([
  "world_verified",
  "payment_requested",
  "payment_confirmed",
  "track_uploaded",
  "pipeline_started",
  "pipeline_completed",
  "pipeline_blocked",
  "error",
]);

export const PIPELINE_STATUSES = new Set<EchoPipelineStatus>(["queued", "running", "done", "blocked", "error"]);

export const RETRYABLE_FLOW_STATUSES = new Set<EchoFlowStatus>(["error", "pipeline_blocked", "pipeline_completed"]);

export const PIPELINE_STEP_TEMPLATES = [
  {
    stepKey: "01",
    label: "Audio to MIDI",
    detail: "Ready for BasicPitch conversion",
    phase: "sequential",
  },
  {
    stepKey: "02A",
    label: "Public fingerprint",
    detail: "Ready for ACRCloud check",
    phase: "parallel",
  },
  {
    stepKey: "02B",
    label: "Private registry",
    detail: "Ready for private MIDI comparison",
    phase: "parallel",
  },
  {
    stepKey: "04",
    label: "Final report",
    detail: "Ready for CRE pipeline summary",
    phase: "sequential",
  },
] as const;

// ── Errors ─────────────────────────────────────────────────────────────────

export class FlowStoreError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message);
  }
}

export function toSafeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return message;
  }

  return message.replaceAll(databaseUrl, "[DATABASE_URL]");
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validateFlowInput(input: CreateFlowInput) {
  if (!input.nullifierHash || !input.trackName || !input.trackFingerprint) {
    throw new FlowStoreError("Missing flow identity fields", 400);
  }
}

export function validateTrackInput(input: SaveTrackInput) {
  if (!input.id || !input.flowId || !input.fileName || !input.contentType || !input.fingerprint || !input.storageProvider) {
    throw new FlowStoreError("Missing track upload fields", 400);
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new FlowStoreError("Invalid track file size", 400);
  }
}

export function validatePipelineStepUpdate(input: UpdatePipelineStepInput) {
  if (!input.flowId || !input.stepKey) {
    throw new FlowStoreError("Missing pipeline step identity fields", 400);
  }

  if (input.status && !PIPELINE_STATUSES.has(input.status)) {
    throw new FlowStoreError("Invalid pipeline step status", 400);
  }

  if (input.progress !== undefined && (!Number.isFinite(input.progress) || input.progress < 0 || input.progress > 100)) {
    throw new FlowStoreError("Invalid pipeline step progress", 400);
  }
}

// ── Id generation ─────────────────────────────────────────────────────────────

export function createFlowId() {
  return `flow_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function createTrackId() {
  return `track_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function createPipelineStepId(flowId: string, stepKey: string) {
  return `pipe_${flowId}_${stepKey.toLowerCase().replaceAll(/[^a-z0-9]/g, "")}`;
}

// ── Pipeline step helpers ─────────────────────────────────────────────────────

export function buildInitialPipelineSteps(flowId: string, trackId: string, now: string): EchoPipelineStep[] {
  return PIPELINE_STEP_TEMPLATES.map((step, index): EchoPipelineStep => ({
    id: createPipelineStepId(flowId, step.stepKey),
    flowId,
    trackId,
    stepKey: step.stepKey,
    label: step.label,
    detail: step.detail,
    phase: step.phase,
    position: index,
    status: index === 0 ? "running" : "queued",
    progress: index === 0 ? 10 : 0,
    meta: index === 0 ? "Queued for backend analysis" : undefined,
    createdAt: now,
    updatedAt: now,
  }));
}

export function sortPipelineSteps(first: EchoPipelineStep, second: EchoPipelineStep) {
  return first.position - second.position;
}
