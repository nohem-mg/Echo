import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The payment gate in /api/pipeline/start: when ECHO_ENFORCE_PAYMENT is on, a
 * flow that never paid (no txHash) must not be able to start analysis.
 *
 * Drives the real route against the file-adapter flow-store (no network — the
 * CRE trigger is disabled while CRE_TRIGGER_URL is unset). cwd is a temp dir so
 * the store starts empty.
 */

let store: typeof import("@/lib/flow-store");
let start: typeof import("@/app/api/pipeline/start/route");
let dataDir: string;
let originalCwd: string;

const FP = `0x${"ab".repeat(32)}`;
const TX = `0x${"1".repeat(64)}` as const;

async function seedPaidFlow(paid: boolean) {
  const flow = await store.createOrReuseFlow({
    nullifierHash: `null_${paid ? "paid" : "unpaid"}_${Math.trunc(performance.now() * 1000)}`,
    trackName: "T",
    trackFingerprint: FP,
    worldMode: "mock",
  });
  if (paid) {
    await store.assignPaymentReference({ flowId: flow.id, paymentReference: "ref", paymentAmountEth: "0.001", paymentChainId: 11155111 });
    await store.confirmFlowPayment({ flowId: flow.id, paymentReference: "ref", txHash: TX });
  }
  await store.saveTrackUpload({
    id: `track_${flow.id}`,
    flowId: flow.id,
    fileName: "t.wav",
    contentType: "audio/wav",
    sizeBytes: 4,
    fingerprint: FP,
    storageProvider: "local_file",
  });
  return flow.id;
}

function startRequest(flowId: string) {
  return start.POST(
    new Request("https://echo.test/api/pipeline/start", {
      method: "POST",
      body: JSON.stringify({ flowId }),
    }),
  );
}

beforeAll(async () => {
  originalCwd = process.cwd();
  dataDir = await mkdtemp(path.join(tmpdir(), "echo-pay-gate-"));
  process.chdir(dataDir);
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL;
  delete process.env.CRE_TRIGGER_URL;
  store = await import("@/lib/flow-store");
  start = await import("@/app/api/pipeline/start/route");
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  delete process.env.ECHO_ENFORCE_PAYMENT;
});

describe("pipeline start payment gate", () => {
  test("enforced + unpaid → 402", async () => {
    process.env.ECHO_ENFORCE_PAYMENT = "true";
    const res = await startRequest(await seedPaidFlow(false));
    expect(res.status).toBe(402);
  });

  test("enforced + paid → not blocked by the gate", async () => {
    process.env.ECHO_ENFORCE_PAYMENT = "true";
    const res = await startRequest(await seedPaidFlow(true));
    expect(res.status).toBe(200);
  });

  test("not enforced + unpaid → allowed (mock/dev default)", async () => {
    const res = await startRequest(await seedPaidFlow(false));
    expect(res.status).toBe(200);
  });
});
