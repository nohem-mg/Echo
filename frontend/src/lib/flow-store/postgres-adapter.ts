import { Pool, type QueryResultRow } from "pg";
import type { EchoFlow, EchoPipelineStep, EchoReport, EchoTrack } from "@/lib/types";
import {
  createPipelineStepId,
  FlowStoreError,
  PIPELINE_STEP_TEMPLATES,
  type AssignPaymentInput,
  type ConfirmPaymentInput,
  type ConfirmRegistryRegistrationInput,
  type CreateFlowInput,
  type FlowStorage,
  type InitializePipelineInput,
  type PersistenceHealthCounts,
  type PipelineOutcomeInput,
  type PipelineOutcomeStatus,
  type SaveTrackInput,
  type UpdatePipelineStepInput,
  createFlowId,
} from "./shared";

const globalForPg = globalThis as unknown as {
  echoFlowPool?: Pool;
  echoFlowSchemaReady?: Promise<void>;
};

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

export const postgresStorage: FlowStorage = {
  async health(): Promise<PersistenceHealthCounts> {
    await ensurePostgresSchema();
    const [flowResult, trackResult, pipelineResult] = await Promise.all([
      getPool().query("SELECT COUNT(*)::int AS count FROM echo_flows"),
      getPool().query("SELECT COUNT(*)::int AS count FROM echo_tracks"),
      getPool().query("SELECT COUNT(*)::int AS count FROM echo_pipeline_steps"),
    ]);
    return {
      flowCount: Number(flowResult.rows[0]?.count ?? 0),
      trackCount: Number(trackResult.rows[0]?.count ?? 0),
      pipelineStepCount: Number(pipelineResult.rows[0]?.count ?? 0),
    };
  },

  async createOrReuseFlow(input: CreateFlowInput): Promise<EchoFlow> {
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
  },

  async getFlow(flowId: string): Promise<EchoFlow | null> {
    await ensurePostgresSchema();
    const result = await getPool().query("SELECT * FROM echo_flows WHERE id = $1 LIMIT 1", [flowId]);
    return result.rows[0] ? rowToFlow(result.rows[0]) : null;
  },

  async setPaymentReference(input: AssignPaymentInput): Promise<EchoFlow> {
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
  },

  async setPaymentConfirmed(input: ConfirmPaymentInput): Promise<EchoFlow> {
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
  },

  async updateRegistryRegistration(input: ConfirmRegistryRegistrationInput, includeTrackId: boolean): Promise<EchoFlow> {
    await ensurePostgresSchema();
    const result = includeTrackId
      ? await getPool().query(
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
        )
      : await getPool().query(
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
  },

  async markFlowError(flowId: string, error: string): Promise<EchoFlow | null> {
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
  },

  async getTrackForFlow(flowId: string): Promise<EchoTrack | null> {
    await ensurePostgresSchema();
    const result = await getPool().query("SELECT * FROM echo_tracks WHERE flow_id = $1 LIMIT 1", [flowId]);
    return result.rows[0] ? rowToTrack(result.rows[0]) : null;
  },

  async insertTrack(input: SaveTrackInput): Promise<EchoTrack> {
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
  },

  async persistPipelineReset(flowId: string, _trackId: string, steps: EchoPipelineStep[]): Promise<EchoPipelineStep[]> {
    await ensurePostgresSchema();
    const client = await getPool().connect();

    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM echo_pipeline_steps WHERE flow_id = $1", [flowId]);

      for (const step of steps) {
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
      return steps;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async initializePipeline(input: InitializePipelineInput): Promise<EchoPipelineStep[]> {
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
  },

  async getPipelineSteps(flowId: string): Promise<EchoPipelineStep[]> {
    await ensurePostgresSchema();
    const result = await getPool().query("SELECT * FROM echo_pipeline_steps WHERE flow_id = $1 ORDER BY position ASC", [flowId]);
    return result.rows.map(rowToPipelineStep);
  },

  async updatePipelineStep(input: UpdatePipelineStepInput): Promise<EchoPipelineStep> {
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
  },

  async updatePipelineOutcome(existing: EchoFlow, status: PipelineOutcomeStatus, input: PipelineOutcomeInput): Promise<EchoFlow> {
    await ensurePostgresSchema();
    const flowId = existing.id;
    const existingError = existing.error;
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
        input.reason ?? (status === "error" ? existingError ?? "Pipeline failed" : null),
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
  },
};

// ── Row mappers ──────────────────────────────────────────────────────────────

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
