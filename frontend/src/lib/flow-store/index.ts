import { fileStorage } from "./file-adapter";
import { postgresStorage } from "./postgres-adapter";
import {
  buildInitialPipelineSteps,
  FlowStoreError,
  RETRYABLE_FLOW_STATUSES,
  toSafeErrorMessage,
  validateFlowInput,
  validatePipelineStepUpdate,
  validateTrackInput,
  type AssignPaymentInput,
  type ConfirmPaymentInput,
  type ConfirmRegistryRegistrationInput,
  type CreateFlowInput,
  type FlowStorage,
  type InitializePipelineInput,
  type PipelineOutcomeInput,
  type PipelineOutcomeStatus,
  type SaveTrackInput,
  type UpdatePipelineStepInput,
} from "./shared";

export { FlowStoreError, toSafeErrorMessage, createTrackId } from "./shared";

/** Picks the persistence backend at call time: Postgres when DATABASE_URL is set, else local file. */
function getStorage(): FlowStorage {
  return process.env.DATABASE_URL ? postgresStorage : fileStorage;
}

export function getPersistenceMode() {
  if (process.env.DATABASE_URL) {
    return "postgres";
  }

  if (process.env.VERCEL) {
    return "missing_database_url";
  }

  return "local_file";
}

export async function getPersistenceHealth() {
  const mode = getPersistenceMode();

  if (mode === "postgres") {
    try {
      const counts = await postgresStorage.health();
      return { ok: true, mode, ...counts };
    } catch (error) {
      return { ok: false, mode, error: toSafeErrorMessage(error) };
    }
  }

  if (mode === "local_file") {
    const counts = await fileStorage.health();
    return { ok: true, mode, ...counts };
  }

  return { ok: false, mode };
}

export async function createOrReuseFlow(input: CreateFlowInput) {
  validateFlowInput(input);
  return getStorage().createOrReuseFlow(input);
}

export async function getFlow(flowId: string) {
  if (!flowId) {
    return null;
  }

  return getStorage().getFlow(flowId);
}

export async function assignPaymentReference(input: AssignPaymentInput) {
  const existing = await getFlow(input.flowId);

  if (!existing) {
    throw new FlowStoreError("Flow not found", 404);
  }

  if (!["world_verified", "payment_requested"].includes(existing.status)) {
    throw new FlowStoreError(`Flow cannot request payment from status ${existing.status}`, 409);
  }

  if (existing.paymentReference) {
    return existing;
  }

  return getStorage().setPaymentReference(input);
}

export async function confirmFlowPayment(input: ConfirmPaymentInput) {
  const existing = await getFlow(input.flowId);

  if (!existing) {
    throw new FlowStoreError("Flow not found", 404);
  }

  if (existing.paymentReference !== input.paymentReference) {
    throw new FlowStoreError("Payment reference does not match this flow", 400);
  }

  if (existing.txHash && existing.txHash !== input.txHash) {
    throw new FlowStoreError("Flow already has a different transaction hash", 409);
  }

  if (existing.txHash === input.txHash) {
    return existing;
  }

  return getStorage().setPaymentConfirmed(input);
}

export async function confirmFlowRegistryRegistration(input: ConfirmRegistryRegistrationInput) {
  const existing = await getFlow(input.flowId);

  if (!existing) {
    throw new FlowStoreError("Flow not found", 404);
  }

  const sameTrackId = existing.registryTrackId?.toLowerCase() === input.registryTrackId.toLowerCase();
  return getStorage().updateRegistryRegistration(input, !sameTrackId);
}

export async function markFlowError(flowId: string, error: string) {
  return getStorage().markFlowError(flowId, error);
}

export async function getTrackForFlow(flowId: string) {
  if (!flowId) {
    return null;
  }

  return getStorage().getTrackForFlow(flowId);
}

export async function saveTrackUpload(input: SaveTrackInput) {
  validateTrackInput(input);

  const [flow, existingTrack] = await Promise.all([getFlow(input.flowId), getTrackForFlow(input.flowId)]);

  if (!flow) {
    throw new FlowStoreError("Flow not found", 404);
  }

  if (flow.trackFingerprint !== input.fingerprint) {
    throw new FlowStoreError("Uploaded audio fingerprint does not match the verified flow", 409);
  }

  if (
    ![
      "world_verified",
      "payment_requested",
      "payment_confirmed",
      "track_uploaded",
      "pipeline_started",
      "pipeline_completed",
      "pipeline_blocked",
      "error",
    ].includes(flow.status)
  ) {
    throw new FlowStoreError(`Flow cannot upload audio from status ${flow.status}`, 409);
  }

  if (existingTrack) {
    if (existingTrack.fingerprint !== input.fingerprint) {
      throw new FlowStoreError("Flow already has a different uploaded track", 409);
    }

    return existingTrack;
  }

  return getStorage().insertTrack(input);
}

/** Reset a terminal flow so the same verified track can re-run analysis (dev retry). */
export async function resetFlowForPipelineRetry(flowId: string, trackId: string) {
  const flow = await getFlow(flowId);
  if (!flow) {
    throw new FlowStoreError("Flow not found", 404);
  }

  if (!RETRYABLE_FLOW_STATUSES.has(flow.status)) {
    return getPipelineSteps(flowId);
  }

  // A completed flow cannot be re-analyzed (CLEAN verdict is final).
  if (flow.status === "pipeline_completed") {
    throw new FlowStoreError("This track has already been analyzed and cannot be re-submitted", 409);
  }

  const now = new Date().toISOString();
  const pipelineSteps = buildInitialPipelineSteps(flowId, trackId, now);
  return getStorage().persistPipelineReset(flowId, trackId, pipelineSteps);
}

export async function initializePipeline(input: InitializePipelineInput) {
  const [flow, track] = await Promise.all([getFlow(input.flowId), getTrackForFlow(input.flowId)]);

  if (!flow) {
    throw new FlowStoreError("Flow not found", 404);
  }

  if (!track || track.id !== input.trackId) {
    throw new FlowStoreError("Track is not attached to this flow", 404);
  }

  if (RETRYABLE_FLOW_STATUSES.has(flow.status)) {
    return resetFlowForPipelineRetry(input.flowId, input.trackId);
  }

  return getStorage().initializePipeline(input);
}

export async function getPipelineSteps(flowId: string) {
  if (!flowId) {
    return [];
  }

  return getStorage().getPipelineSteps(flowId);
}

export async function updatePipelineStep(input: UpdatePipelineStepInput) {
  validatePipelineStepUpdate(input);
  return getStorage().updatePipelineStep(input);
}

export async function completePipeline(input: PipelineOutcomeInput) {
  return updatePipelineOutcome(input.flowId, "pipeline_completed", input);
}

export async function blockPipeline(input: PipelineOutcomeInput) {
  return updatePipelineOutcome(input.flowId, "pipeline_blocked", input);
}

export async function updatePipelineOutcome(
  flowId: string,
  status: PipelineOutcomeStatus,
  input: PipelineOutcomeInput = { flowId },
) {
  const existing = await getFlow(flowId);

  if (!existing) {
    throw new FlowStoreError("Flow not found", 404);
  }

  return getStorage().updatePipelineOutcome(existing, status, input);
}
