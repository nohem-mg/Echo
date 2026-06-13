import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool, type QueryResultRow } from "pg";
import type { EchoFlow, EchoFlowStatus } from "@/lib/types";

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

type FlowFile = {
  flows: EchoFlow[];
};

const FLOW_STATUSES = new Set<EchoFlowStatus>(["world_verified", "payment_requested", "payment_confirmed", "pipeline_started", "error"]);
const FLOW_STORE_FILE = path.join(process.cwd(), ".data", "echo-flows.json");

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

export async function createOrReuseFlow(input: CreateFlowInput) {
  validateFlowInput(input);

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
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

  if (process.env.DATABASE_URL) {
    await ensurePostgresSchema();
    const result = await getPool().query(
      `
      UPDATE echo_flows
      SET
        tx_hash = $2,
        wallet_address = COALESCE($3, wallet_address),
        status = 'pipeline_started',
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
    status: "pipeline_started",
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

export class FlowStoreError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message);
  }
}

function getPool() {
  if (!globalForPg.echoFlowPool) {
    globalForPg.echoFlowPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }

  return globalForPg.echoFlowPool;
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
        payment_reference text UNIQUE,
        payment_amount_eth text,
        payment_chain_id integer,
        tx_hash text UNIQUE,
        status text NOT NULL,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS echo_flows_nullifier_track_idx
      ON echo_flows (nullifier_hash, track_fingerprint);
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
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { flows: [] };
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

function createFlowId() {
  return `flow_${crypto.randomUUID().replaceAll("-", "")}`;
}

function rowToFlow(row: QueryResultRow): EchoFlow {
  return {
    id: row.id,
    nullifierHash: row.nullifier_hash,
    trackName: row.track_name,
    trackFingerprint: row.track_fingerprint,
    worldMode: row.world_mode,
    walletAddress: row.wallet_address ?? undefined,
    paymentReference: row.payment_reference ?? undefined,
    paymentAmountEth: row.payment_amount_eth ?? undefined,
    paymentChainId: row.payment_chain_id ?? undefined,
    txHash: row.tx_hash ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function isEchoFlow(value: unknown): value is EchoFlow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const flow = value as Partial<EchoFlow>;
  return Boolean(flow.id && flow.nullifierHash && flow.trackName && flow.trackFingerprint && flow.status && FLOW_STATUSES.has(flow.status));
}
