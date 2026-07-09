import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * End-to-end test of the flow pipeline through the public flow-store API:
 * the same call sequence the API routes make, asserting that data written by
 * each step is what the next step reads.
 *
 * Runs against the file adapter by default. Set FLOW_STORE_TEST_DATABASE_URL
 * to run the identical suite against the Postgres adapter (the backend every
 * Vercel deployment uses) — CI runs both.
 *
 * The file adapter resolves its data file from process.cwd() at import time,
 * so the store is imported dynamically after chdir'ing into a temp dir.
 */

const TEST_DATABASE_URL = process.env.FLOW_STORE_TEST_DATABASE_URL;

let store: typeof import("@/lib/flow-store");
let dataDir: string;
let originalCwd: string;

const FINGERPRINT = `0x${"ab".repeat(32)}`;
const TX_HASH = `0x${"1".repeat(64)}` as const;

beforeAll(async () => {
  originalCwd = process.cwd();
  dataDir = await mkdtemp(path.join(tmpdir(), "echo-flow-store-test-"));
  process.chdir(dataDir);
  if (TEST_DATABASE_URL) {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
  } else {
    delete process.env.DATABASE_URL;
  }
  delete process.env.VERCEL;
  store = await import("@/lib/flow-store");

  if (TEST_DATABASE_URL) {
    // First store call creates the schema; then start from empty tables so
    // the suite's fixed ids can't collide with a previous local run.
    await store.getPersistenceHealth();
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await pool.query("TRUNCATE echo_flows, echo_tracks, echo_pipeline_steps");
    await pool.end();
  }
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(dataDir, { recursive: true, force: true });
});

describe("flow lifecycle: verify → pay → upload → analyze → complete", () => {
  let flowId: string;

  test("world verification creates a flow (and re-verifying reuses it)", async () => {
    const flow = await store.createOrReuseFlow({
      nullifierHash: "null_artist_1",
      trackName: "Test Track",
      trackFingerprint: FINGERPRINT,
      worldMode: "mock",
    });
    flowId = flow.id;
    expect(flow.status).toBe("world_verified");

    const reused = await store.createOrReuseFlow({
      nullifierHash: "null_artist_1",
      trackName: "Test Track",
      trackFingerprint: FINGERPRINT,
      worldMode: "mock",
    });
    expect(reused.id).toBe(flow.id);
  });

  test("payment reference is assigned, then confirmed against the same reference", async () => {
    const requested = await store.assignPaymentReference({
      flowId,
      paymentReference: "pay_ref_1",
      paymentAmountEth: "0.01",
      paymentChainId: 480,
    });
    expect(requested.status).toBe("payment_requested");
    expect(requested.paymentReference).toBe("pay_ref_1");

    await expect(
      store.confirmFlowPayment({ flowId, paymentReference: "pay_ref_WRONG", txHash: TX_HASH }),
    ).rejects.toThrow("Payment reference does not match this flow");

    const confirmed = await store.confirmFlowPayment({
      flowId,
      paymentReference: "pay_ref_1",
      txHash: TX_HASH,
    });
    expect(confirmed.status).toBe("payment_confirmed");
    expect(confirmed.txHash).toBe(TX_HASH);
  });

  test("track upload must match the fingerprint verified at flow creation", async () => {
    await expect(
      store.saveTrackUpload({
        id: "track_mismatch",
        flowId,
        fileName: "other.wav",
        contentType: "audio/wav",
        sizeBytes: 4,
        fingerprint: `0x${"ff".repeat(32)}`,
        storageProvider: "local_file",
      }),
    ).rejects.toThrow("fingerprint does not match");

    const track = await store.saveTrackUpload({
      id: "track_1",
      flowId,
      fileName: "test.wav",
      contentType: "audio/wav",
      sizeBytes: 4,
      fingerprint: FINGERPRINT,
      storageProvider: "local_file",
    });
    expect(track.flowId).toBe(flowId);
    expect((await store.getFlow(flowId))?.status).toBe("track_uploaded");
    expect((await store.getTrackForFlow(flowId))?.id).toBe("track_1");
  });

  test("pipeline initialization creates the four analysis steps and starts step 01", async () => {
    const steps = await store.initializePipeline({ flowId, trackId: "track_1" });
    expect(steps.map((step) => step.stepKey)).toEqual(["01", "02A", "02B", "04"]);
    expect(steps[0].status).toBe("running");
    expect(steps.slice(1).every((step) => step.status === "queued")).toBe(true);
    expect((await store.getFlow(flowId))?.status).toBe("pipeline_started");
  });

  test("step updates written by the pipeline are read back by status polling", async () => {
    await expect(
      store.updatePipelineStep({ flowId, stepKey: "01", progress: 250 }),
    ).rejects.toThrow("Invalid pipeline step progress");

    await store.updatePipelineStep({ flowId, stepKey: "01", status: "done", progress: 100, meta: "MIDI ready" });
    const steps = await store.getPipelineSteps(flowId);
    const step01 = steps.find((step) => step.stepKey === "01");
    expect(step01?.status).toBe("done");
    expect(step01?.progress).toBe(100);
    expect(step01?.meta).toBe("MIDI ready");
    expect(steps.find((step) => step.stepKey === "04")?.status).toBe("queued");
  });

  test("completing the pipeline finalizes the flow", async () => {
    const completed = await store.completePipeline({ flowId });
    expect(completed.status).toBe("pipeline_completed");
    expect((await store.getFlow(flowId))?.status).toBe("pipeline_completed");
  });

  test("a completed track cannot be re-registered by another identity, nor re-analyzed", async () => {
    await expect(
      store.createOrReuseFlow({
        nullifierHash: "null_artist_2",
        trackName: "Copycat",
        trackFingerprint: FINGERPRINT,
        worldMode: "mock",
      }),
    ).rejects.toThrow("already registered by another artist");

    await expect(store.initializePipeline({ flowId, trackId: "track_1" })).rejects.toThrow(
      "already been analyzed",
    );
  });
});

describe("blocked pipeline", () => {
  test("a blocked flow records the reason and allows retry initialization", async () => {
    const flow = await store.createOrReuseFlow({
      nullifierHash: "null_artist_3",
      trackName: "Blocked Track",
      trackFingerprint: `0x${"cd".repeat(32)}`,
      worldMode: "mock",
    });

    await store.saveTrackUpload({
      id: "track_blocked",
      flowId: flow.id,
      fileName: "blocked.wav",
      contentType: "audio/wav",
      sizeBytes: 4,
      fingerprint: `0x${"cd".repeat(32)}`,
      storageProvider: "local_file",
    });
    await store.initializePipeline({ flowId: flow.id, trackId: "track_blocked" });

    const blocked = await store.blockPipeline({ flowId: flow.id, reason: "Similarity above threshold" });
    expect(blocked.status).toBe("pipeline_blocked");

    // A blocked (non-completed) flow is retryable: re-initialization resets the steps.
    const steps = await store.initializePipeline({ flowId: flow.id, trackId: "track_blocked" });
    expect(steps.map((step) => step.stepKey)).toEqual(["01", "02A", "02B", "04"]);
    expect((await store.getFlow(flow.id))?.status).toBe("pipeline_started");
  });
});
