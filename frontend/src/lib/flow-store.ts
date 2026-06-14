import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool, type QueryResultRow } from "pg";
import type { EchoFlow, EchoFlowStatus, EchoPipelineStep, EchoPipelineStatus, EchoReport, EchoTrack } from "@/lib/types";

type CreateFlowInput = {
  nullifierHash: string;
  trackName: string;
  trackFingerprint: string;
  worldMode: "world" | "mock";
};

type AssignPaymentInput = {
  flowId: string;
  paymentReference: string;
  paymentAmountEth: string;
  paymentChainId: number;
};

type ConfirmPaymentInput = {
  flowId: string;
  paymentReference: string;
  txHash: `0x${string}`;
  walletAddress?: `0x${string}`;
};

type ConfirmRegistryRegistrationInput = {
  flowId: string;
  registryTrackId: `0x${string}`;
  commitmentHash: `0x${string}`;
  registryRef: `0x${string}`;
};

type SaveTrackInput = {
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

type InitializePipelineInput = {
  flowId: string;
  trackId: string;
  ownerAddress?: string;
};

type UpdatePipelineStepInput = {
  flowId: string;
  stepKey: string;
  status?: EchoPipelineStatus;
  progress?: number;
  meta?: string | null;
  reason?: string | null;
  detail?: string;
};

type PipelineOutcomeInput = {
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

type FlowFile = {
  flows: EchoFlow[];
  tracks: EchoTrack[];
  pipelineSteps: EchoPipelineStep[];
};

const FLOW_STATUSES = new Set<EchoFlowStatus>([
  "world_verified",
  "payment_requested",
  "payment_confirmed",
  "track_uploaded",
  "pipeline_started",
  "pipeline_completed",
  "pipeline_blocked",
  "error",
]);
const PIPELINE_STATUSES = new Set<EchoPipelineStatus>(["queued", "running", "done", "blocked", "error"]);
const FLOW_STORE_FILE = path.join(process.cwd(), ".data", "echo-flows.json");

const PIPELINE_STEP_TEMPLATES = [
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

const globalForPg = globalThis as unknown as {
  echoFlowPool?: Pool;
  echoFlowSchemaReady?: Promise<void>;
};

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
      await ensurePostgresSchema();
      const [flowResult, trackResult, pipelineResult] = await Promise.all([
        getPool().query("SELECT COUNT(*)::int AS count FROM echo_flows"),
        getPool().query("SELECT COUNT(*)::int AS count FROM echo_tracks"),
        getPool().query("SELECT COUNT(*)::int AS count FROM echo_pipeline_steps"),
      ]);
      return {
        ok: true,
        mode,
        flowCount: Number(flowResult.rows[0]?.count ?? 0),
        trackCount: Number(trackResult.rows[0]?.count ?? 0),
        pipelineStepCount: Number(pipelineResult.rows[0]?.count ?? 0),
      };
    } catch (error) {
      return {
        ok: false,
        mode,
        error: toSafeErrorMessage(error),
      };
    }
  }

  if (mode === "local_file") {
    const file = await readFlowFile();

    return {
      ok: true,
      mode,
      flowCount: file.flows.length,
      trackCount: file.tracks.length,
      pipelineStepCount: file.pipelineSteps.length,
    };
  }

  return {
    ok: false,
    mode,
  };
}

export async function createOrReuseFlow(input: CreateFlowInput) {
  validateFlowInput(input);

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();

    // Block a different identity from submitting a track whose analysis already completed.
    const completed = await getPool().query(
      `SELECT nullifier_hash FROM echo_flows
       WHERE track_fingerprint = $1
         AND status = 'pipeline_completed'
         AND nullifier_hash != $2
       LIMIT 1`,
      [input.trackFingerprint, input.nullifierHash],
    );
    if (completed.rows.length > 0) {
      throw new FlowStoreError("This track is already registered by another artist", 409);
    }

    const result = await getPool().query(
      `
      INSERT INTO echo_flows (
        id,
        nullifier_hash,
        track_name,
        track_fingerprint,
        world_mode,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'world_verified')
      ON CONFLICT (nullifier_hash, track_fingerprint)
      DO UPDATE SET updated_at = echo_flows.updated_at
      RETURNING *
      `,
      [createFlowId(), input.nullifierHash, input.trackName, input.trackFingerprint, input.worldMode],
    );

    return rowToFlow(result.rows[0]);
  }

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
}

export async function getFlow(flowId: string) {
  if (!flowId) {
    return null;
  }

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const result = await getPool().query("SELECT * FROM echo_flows WHERE id = $1 LIMIT 1", [flowId]);
    return result.rows[0] ? rowToFlow(result.rows[0]) : null;
  }

  assertLocalFileStoreAvailable();
  const file = await readFlowFile();
  return file.flows.find((flow) => flow.id === flowId) ?? null;
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

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const result = await getPool().query(
      `
      UPDATE echo_flows
      SET
        payment_reference = $2,
        payment_amount_eth = $3,
        payment_chain_id = $4,
        status = 'payment_requested',
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [input.flowId, input.paymentReference, input.paymentAmountEth, input.paymentChainId],
    );

    return rowToFlow(result.rows[0]);
  }

  assertLocalFileStoreAvailable();
  return updateFlowFile(input.flowId, (flow) => ({
    ...flow,
    paymentReference: input.paymentReference,
    paymentAmountEth: input.paymentAmountEth,
    paymentChainId: input.paymentChainId,
    status: "payment_requested",
  }));
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

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const result = await getPool().query(
      `
      UPDATE echo_flows
      SET
        tx_hash = $2,
        wallet_address = COALESCE($3, wallet_address),
        status = 'payment_confirmed',
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [input.flowId, input.txHash, input.walletAddress ?? null],
    );

    return rowToFlow(result.rows[0]);
  }

  assertLocalFileStoreAvailable();
  return updateFlowFile(input.flowId, (flow) => ({
    ...flow,
    txHash: input.txHash,
    walletAddress: input.walletAddress ?? flow.walletAddress,
    status: "payment_confirmed",
  }));
}

export async function confirmFlowRegistryRegistration(input: ConfirmRegistryRegistrationInput) {
  const existing = await getFlow(input.flowId);

  if (!existing) {
    throw new FlowStoreError("Flow not found", 404);
  }

  if (existing.registryTrackId?.toLowerCase() === input.registryTrackId.toLowerCase()) {
    if (process.env.DATABASE_URL) {
      await ensurePostgresSchema();
      const result = await getPool().query(
        `
        UPDATE echo_flows
        SET
          commitment_hash = $2,
          registry_ref = $3,
          updated_at = now()
        WHERE id = $1
        RETURNING *
        `,
        [input.flowId, input.commitmentHash, input.registryRef],
      );

      return rowToFlow(result.rows[0]);
    }

    assertLocalFileStoreAvailable();
    return updateFlowFile(input.flowId, (flow) => ({
      ...flow,
      commitmentHash: input.commitmentHash,
      registryRef: input.registryRef,
    }));
  }

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const result = await getPool().query(
      `
      UPDATE echo_flows
      SET
        commitment_hash = $2,
        registry_ref = $3,
        registry_track_id = $4,
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [input.flowId, input.commitmentHash, input.registryRef, input.registryTrackId],
    );

    return rowToFlow(result.rows[0]);
  }

  assertLocalFileStoreAvailable();
  return updateFlowFile(input.flowId, (flow) => ({
    ...flow,
    commitmentHash: input.commitmentHash,
    registryRef: input.registryRef,
    registryTrackId: input.registryTrackId,
  }));
}

export async function markFlowError(flowId: string, error: string) {
  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const result = await getPool().query(
      `
      UPDATE echo_flows
      SET status = 'error', error = $2, updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [flowId, error],
    );

    return result.rows[0] ? rowToFlow(result.rows[0]) : null;
  }

  assertLocalFileStoreAvailable();
  return updateFlowFile(flowId, (flow) => ({
    ...flow,
    status: "error",
    error,
  }));
}

export async function getTrackForFlow(flowId: string) {
  if (!flowId) {
    return null;
  }

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const result = await getPool().query("SELECT * FROM echo_tracks WHERE flow_id = $1 LIMIT 1", [flowId]);
    return result.rows[0] ? rowToTrack(result.rows[0]) : null;
  }

  assertLocalFileStoreAvailable();
  const file = await readFlowFile();
  return file.tracks.find((track) => track.flowId === flowId) ?? null;
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

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const client = await getPool().connect();

    try {
      await client.query("BEGIN");
      const result = await client.query(
        `
        INSERT INTO echo_tracks (
          id,
          flow_id,
          file_name,
          content_type,
          size_bytes,
          fingerprint,
          storage_provider,
          storage_url,
          storage_path
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (flow_id) DO NOTHING
        RETURNING *
        `,
        [
          input.id,
          input.flowId,
          input.fileName,
          input.contentType,
          input.sizeBytes,
          input.fingerprint,
          input.storageProvider,
          input.storageUrl ?? null,
          input.storagePath ?? null,
        ],
      );

      const trackResult =
        result.rows[0] ??
        (
          await client.query("SELECT * FROM echo_tracks WHERE flow_id = $1 LIMIT 1", [
            input.flowId,
          ])
        ).rows[0];

      await client.query(
        `
        UPDATE echo_flows
        SET
          status = CASE
            WHEN status IN ('pipeline_started', 'pipeline_completed', 'pipeline_blocked', 'error') THEN status
            ELSE 'track_uploaded'
          END,
          updated_at = now()
        WHERE id = $1
        `,
        [input.flowId],
      );
      await client.query("COMMIT");

      return rowToTrack(trackResult);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

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
}

const RETRYABLE_FLOW_STATUSES = new Set<EchoFlowStatus>(["error", "pipeline_blocked", "pipeline_completed"]);

function buildInitialPipelineSteps(flowId: string, trackId: string, now: string): EchoPipelineStep[] {
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

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const client = await getPool().connect();

    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM echo_pipeline_steps WHERE flow_id = $1", [flowId]);

      for (const step of pipelineSteps) {
        await client.query(
          `
          INSERT INTO echo_pipeline_steps (
            id, flow_id, track_id, step_key, label, detail, phase, position, status, progress, meta
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          [
            step.id,
            step.flowId,
            step.trackId,
            step.stepKey,
            step.label,
            step.detail,
            step.phase,
            step.position,
            step.status,
            step.progress,
            step.meta ?? null,
          ],
        );
      }

      await client.query(
        `
        UPDATE echo_flows
        SET
          status = 'pipeline_started',
          error = NULL,
          report = NULL,
          commitment_hash = NULL,
          registry_ref = NULL,
          registry_track_id = NULL,
          registry_tx_hash = NULL,
          updated_at = now()
        WHERE id = $1
        `,
        [flowId],
      );
      await client.query("COMMIT");
      return pipelineSteps;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  assertLocalFileStoreAvailable();
  const file = await readFlowFile();
  file.pipelineSteps = file.pipelineSteps.filter((step) => step.flowId !== flowId);
  file.pipelineSteps.push(...pipelineSteps);
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
  return pipelineSteps;
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

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const client = await getPool().connect();

    try {
      await client.query("BEGIN");

      for (const [index, step] of PIPELINE_STEP_TEMPLATES.entries()) {
        await client.query(
          `
            INSERT INTO echo_pipeline_steps (
              id,
              flow_id,
              track_id,
              step_key,
              label,
              detail,
              phase,
              position,
              status,
              progress,
              meta
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (flow_id, step_key) DO NOTHING
            `,
          [
            createPipelineStepId(input.flowId, step.stepKey),
            input.flowId,
            input.trackId,
            step.stepKey,
            step.label,
            step.detail,
            step.phase,
            index,
            index === 0 ? "running" : "queued",
            index === 0 ? 10 : 0,
            index === 0 ? "Queued for backend analysis" : null,
          ],
        );
      }

      await client.query(
        `
        UPDATE echo_flows
        SET
          status = CASE
            WHEN status IN ('pipeline_completed', 'pipeline_blocked', 'error') THEN status
            ELSE 'pipeline_started'
          END,
          owner_address = COALESCE($2, owner_address),
          updated_at = now()
        WHERE id = $1
        `,
        [input.flowId, input.ownerAddress ?? null],
      );

      const result = await client.query("SELECT * FROM echo_pipeline_steps WHERE flow_id = $1 ORDER BY position ASC", [input.flowId]);
      await client.query("COMMIT");
      return result.rows.map(rowToPipelineStep);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

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
}

export async function getPipelineSteps(flowId: string) {
  if (!flowId) {
    return [];
  }

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const result = await getPool().query("SELECT * FROM echo_pipeline_steps WHERE flow_id = $1 ORDER BY position ASC", [flowId]);
    return result.rows.map(rowToPipelineStep);
  }

  assertLocalFileStoreAvailable();
  const file = await readFlowFile();
  return file.pipelineSteps.filter((step) => step.flowId === flowId).sort(sortPipelineSteps);
}

export async function updatePipelineStep(input: UpdatePipelineStepInput) {
  validatePipelineStepUpdate(input);

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const result = await getPool().query(
      `
      UPDATE echo_pipeline_steps
      SET
        status = COALESCE($3, status),
        progress = COALESCE($4, progress),
        meta = COALESCE($5, meta),
        reason = COALESCE($6, reason),
        detail = COALESCE($7, detail),
        updated_at = now()
      WHERE flow_id = $1 AND step_key = $2
      RETURNING *
      `,
      [
        input.flowId,
        input.stepKey,
        input.status ?? null,
        typeof input.progress === "number" ? input.progress : null,
        input.meta ?? null,
        input.reason ?? null,
        input.detail ?? null,
      ],
    );

    if (!result.rows[0]) {
      throw new FlowStoreError("Pipeline step not found", 404);
    }

    return rowToPipelineStep(result.rows[0]);
  }

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
}

export async function completePipeline(input: PipelineOutcomeInput) {
  return updatePipelineOutcome(input.flowId, "pipeline_completed", input);
}

export async function blockPipeline(input: PipelineOutcomeInput) {
  return updatePipelineOutcome(input.flowId, "pipeline_blocked", input);
}

export async function updatePipelineOutcome(
  flowId: string,
  status: Extract<EchoFlowStatus, "pipeline_completed" | "pipeline_blocked" | "error">,
  input: PipelineOutcomeInput = { flowId },
) {
  const existing = await getFlow(flowId);

  if (!existing) {
    throw new FlowStoreError("Flow not found", 404);
  }

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const result = await getPool().query(
      `
      UPDATE echo_flows
      SET
        status = $2,
        error = $3,
        registry_track_id = CASE
          WHEN $9::boolean THEN NULL
          WHEN $6::text IS NOT NULL THEN $6::text
          ELSE registry_track_id
        END,
        registry_tx_hash = CASE
          WHEN $9::boolean OR $10::boolean THEN NULL
          WHEN $7::text IS NOT NULL THEN $7::text
          ELSE registry_tx_hash
        END,
        commitment_hash = CASE
          WHEN $9::boolean THEN NULL
          WHEN $4::text IS NOT NULL THEN $4::text
          ELSE commitment_hash
        END,
        registry_ref = CASE
          WHEN $9::boolean THEN NULL
          WHEN $5::text IS NOT NULL THEN $5::text
          ELSE registry_ref
        END,
        report = COALESCE($8::jsonb, report),
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        flowId,
        status,
        input.reason ?? (status === "error" ? existing.error ?? "Pipeline failed" : null),
        input.commitmentHash ?? null,
        input.registryRef ?? null,
        input.registryTrackId ?? null,
        input.registryTxHash ?? null,
        input.report ? JSON.stringify(input.report) : null,
        input.clearOnChainHandoff ?? false,
        input.clearRegistryTxHash ?? false,
      ],
    );

    return rowToFlow(result.rows[0]);
  }

  assertLocalFileStoreAvailable();
  return updateFlowFile(flowId, (flow) => ({
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
}

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

function getPool() {
  if (!globalForPg.echoFlowPool) {
    const connectionString = normalizePostgresConnectionString(process.env.DATABASE_URL);

    globalForPg.echoFlowPool = new Pool({
      connectionString,
      ssl: shouldUsePostgresSsl(connectionString) ? { rejectUnauthorized: false } : false,
      max: 3,
    });
  }

  return globalForPg.echoFlowPool;
}

function normalizePostgresConnectionString(connectionString: string | undefined) {
  if (!connectionString) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);

    // pg-connection-string can let sslmode override the explicit ssl object.
    // Keep TLS controlled by the Pool config so Vercel/self-signed chains work.
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
      url.searchParams.delete(key);
    }

    return url.toString();
  } catch {
    return connectionString;
  }
}

function shouldUsePostgresSsl(connectionString: string | undefined) {
  if (!connectionString) {
    return false;
  }

  return !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");
}

async function ensurePostgresSchema() {
  if (!globalForPg.echoFlowSchemaReady) {
    globalForPg.echoFlowSchemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS echo_flows (
        id text PRIMARY KEY,
        nullifier_hash text NOT NULL,
        track_name text NOT NULL,
        track_fingerprint text NOT NULL,
        world_mode text NOT NULL,
        wallet_address text,
        owner_address text,
        payment_reference text UNIQUE,
        payment_amount_eth text,
        payment_chain_id integer,
        tx_hash text UNIQUE,
        status text NOT NULL,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      ALTER TABLE echo_flows
        ADD COLUMN IF NOT EXISTS commitment_hash text,
        ADD COLUMN IF NOT EXISTS registry_ref text,
        ADD COLUMN IF NOT EXISTS registry_track_id text,
        ADD COLUMN IF NOT EXISTS registry_tx_hash text,
        ADD COLUMN IF NOT EXISTS owner_address text,
        ADD COLUMN IF NOT EXISTS report jsonb;

      CREATE UNIQUE INDEX IF NOT EXISTS echo_flows_nullifier_track_idx
      ON echo_flows (nullifier_hash, track_fingerprint);

      CREATE TABLE IF NOT EXISTS echo_tracks (
        id text PRIMARY KEY,
        flow_id text NOT NULL UNIQUE REFERENCES echo_flows(id) ON DELETE CASCADE,
        file_name text NOT NULL,
        content_type text NOT NULL,
        size_bytes bigint NOT NULL,
        fingerprint text NOT NULL,
        storage_provider text NOT NULL,
        storage_url text,
        storage_path text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS echo_tracks_fingerprint_idx
      ON echo_tracks (fingerprint);

      CREATE TABLE IF NOT EXISTS echo_pipeline_steps (
        id text PRIMARY KEY,
        flow_id text NOT NULL REFERENCES echo_flows(id) ON DELETE CASCADE,
        track_id text NOT NULL REFERENCES echo_tracks(id) ON DELETE CASCADE,
        step_key text NOT NULL,
        label text NOT NULL,
        detail text NOT NULL,
        phase text NOT NULL,
        position integer NOT NULL,
        status text NOT NULL,
        progress integer NOT NULL DEFAULT 0,
        meta text,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (flow_id, step_key)
      );

      CREATE INDEX IF NOT EXISTS echo_pipeline_steps_flow_position_idx
      ON echo_pipeline_steps (flow_id, position);
    `).then(() => undefined);
  }

  return globalForPg.echoFlowSchemaReady;
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

function assertLocalFileStoreAvailable() {
  if (process.env.VERCEL) {
    throw new FlowStoreError("Missing DATABASE_URL. Vercel needs a durable Postgres database for Echo flow persistence.", 500);
  }
}

function validateFlowInput(input: CreateFlowInput) {
  if (!input.nullifierHash || !input.trackName || !input.trackFingerprint) {
    throw new FlowStoreError("Missing flow identity fields", 400);
  }
}

function validateTrackInput(input: SaveTrackInput) {
  if (!input.id || !input.flowId || !input.fileName || !input.contentType || !input.fingerprint || !input.storageProvider) {
    throw new FlowStoreError("Missing track upload fields", 400);
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new FlowStoreError("Invalid track file size", 400);
  }
}

function validatePipelineStepUpdate(input: UpdatePipelineStepInput) {
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

function createFlowId() {
  return `flow_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function createTrackId() {
  return `track_${crypto.randomUUID().replaceAll("-", "")}`;
}

function createPipelineStepId(flowId: string, stepKey: string) {
  return `pipe_${flowId}_${stepKey.toLowerCase().replaceAll(/[^a-z0-9]/g, "")}`;
}

function rowToFlow(row: QueryResultRow): EchoFlow {
  return {
    id: row.id,
    nullifierHash: row.nullifier_hash,
    trackName: row.track_name,
    trackFingerprint: row.track_fingerprint,
    worldMode: row.world_mode,
    walletAddress: row.wallet_address ?? undefined,
    ownerAddress: row.owner_address ?? undefined,
    paymentReference: row.payment_reference ?? undefined,
    paymentAmountEth: row.payment_amount_eth ?? undefined,
    paymentChainId: row.payment_chain_id ?? undefined,
    txHash: row.tx_hash ?? undefined,
    commitmentHash: row.commitment_hash ?? undefined,
    registryRef: row.registry_ref ?? undefined,
    registryTrackId: row.registry_track_id ?? undefined,
    registryTxHash: row.registry_tx_hash ?? undefined,
    report: normalizeReport(row.report),
    status: row.status,
    error: row.error ?? undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToTrack(row: QueryResultRow): EchoTrack {
  return {
    id: row.id,
    flowId: row.flow_id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    fingerprint: row.fingerprint,
    storageProvider: row.storage_provider,
    storageUrl: row.storage_url ?? undefined,
    storagePath: row.storage_path ?? undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToPipelineStep(row: QueryResultRow): EchoPipelineStep {
  return {
    id: row.id,
    flowId: row.flow_id,
    trackId: row.track_id,
    stepKey: row.step_key,
    label: row.label,
    detail: row.detail,
    phase: row.phase,
    position: Number(row.position),
    status: row.status,
    progress: Number(row.progress),
    meta: row.meta ?? undefined,
    reason: row.reason ?? undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizeReport(value: unknown): EchoReport | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    try {
      return normalizeReport(JSON.parse(value));
    } catch {
      return undefined;
    }
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const report = value as Partial<EchoReport>;
  if (
    (report.verdict === "CLEAN" || report.verdict === "SIMILAR" || report.verdict === "REJECTED") &&
    Array.isArray(report.similar_tracks)
  ) {
    return {
      verdict: report.verdict,
      submitted_track: report.submitted_track,
      similar_tracks: report.similar_tracks,
      public_references: Array.isArray(report.public_references) ? report.public_references : undefined,
      ai_summary: typeof report.ai_summary === "string" ? report.ai_summary : undefined,
    };
  }

  return undefined;
}

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

function sortPipelineSteps(first: EchoPipelineStep, second: EchoPipelineStep) {
  return first.position - second.position;
}
