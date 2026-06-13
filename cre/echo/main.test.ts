import { describe, expect, test } from "bun:test";
import { initWorkflow, runPipelineWithClient, type Config } from "./main";
import { parsePipelineInput } from "./parse-input";
import { BackendError, type Deferred } from "./backend";
import type { PipelineClient } from "./client";
import { buildPipelineCompletionEvent } from "./pipeline-events";
import type {
  CheckPublicResponse,
  CommercialDelta,
  ComparePrivateResponse,
  PipelineInput,
  RegistryMatch,
  ReportResponse,
} from "./types";

// -------------------------------------------------------------------------
// Test helpers
// -------------------------------------------------------------------------
const INPUT: PipelineInput = {
  flowId: "flow_test",
  audioRef: "https://echo-backend.local/audio/test",
  commitmentHash: "0xabc",
  registryRef: "0xregistryref",
  worldNullifier: "0xdef",
  trackId: "0x0000000000000000000000000000000000000000000000000000000000000001",
};

const deferred = <T>(value: T): Deferred<T> => ({ result: () => value });
const throwing = <T>(err: unknown): Deferred<T> => ({
  result: () => {
    throw err;
  },
});

const REPORT: ReportResponse = {
  verdict: "CLEAN",
  submitted_track: { key: "A", mode: "min", BPM: 171, fingerprint: "fp" },
  similar_tracks: [],
  ai_summary: "clean",
};

// Builds a fake client; any step can be overridden to throw or return data.
const makeClient = (opts: {
  matches?: CheckPublicResponse["matches"];
  registry?: RegistryMatch[];
  commercial?: CommercialDelta[];
  report?: ReportResponse;
  failOn?: keyof PipelineClient;
  error?: unknown;
}): { client: PipelineClient; calls: string[] } => {
  const calls: string[] = [];
  const guard = <T>(name: keyof PipelineClient, value: T): Deferred<T> => {
    calls.push(name);
    if (opts.failOn === name) return throwing<T>(opts.error ?? new Error("boom"));
    return deferred(value);
  };
  const client: PipelineClient = {
    convert: () => guard("convert", { midiSequence: "midi://x" }),
    checkPublic: () => guard("checkPublic", { matches: opts.matches ?? [] }),
    comparePrivate: () =>
      guard<ComparePrivateResponse>("comparePrivate", { registry_matches: opts.registry ?? [] }),
    compareCommercial: () =>
      guard("compareCommercial", { commercial_deltas: opts.commercial ?? [] }),
    report: () => guard("report", opts.report ?? REPORT),
    register: () => guard("register", { track_id: INPUT.trackId, request_id: "req-test" }),
    getAgentAttestations: () => [],
  };
  return { client, calls };
};

const noop = () => {};

// -------------------------------------------------------------------------
// Fail-fast logic
// -------------------------------------------------------------------------
describe("fail-fast — Step 2A (ACRCloud >= 95%)", () => {
  test("halts with REJECTED and never reaches the report", () => {
    const { client, calls } = makeClient({
      matches: [{ ISRC: "USRC1", confidence_score: 96 }],
      registry: [{ track_id: "t1", similarity_score: 10 }],
    });

    const res = runPipelineWithClient(noop, client, INPUT);

    expect(res.verdict).toBe("REJECTED");
    expect(res.commitmentHash).toBe(INPUT.commitmentHash);
    expect(res.report?.verdict).toBe("REJECTED");
    expect(res.report?.similar_tracks[0]?.score).toBe(96);
    expect(calls).not.toContain("report");
    expect(calls).not.toContain("compareCommercial");
  });

  test("94% does NOT trigger plagiarism halt", () => {
    const { client } = makeClient({
      matches: [{ ISRC: "USRC1", confidence_score: 94 }],
      registry: [],
    });

    const res = runPipelineWithClient(noop, client, INPUT);

    expect(res.verdict).not.toBe("REJECTED");
  });
});

describe("fail-fast — Step 2B (similarity >= 75%)", () => {
  test("halts with SIMILAR and never reaches the report", () => {
    const { client, calls } = makeClient({
      matches: [],
      registry: [{ track_id: "t1", similarity_score: 81 }],
    });

    const res = runPipelineWithClient(noop, client, INPUT);

    expect(res.verdict).toBe("SIMILAR");
    expect(res.report?.verdict).toBe("SIMILAR");
    expect(res.report?.similar_tracks[0]?.score).toBe(81);
    expect(calls).not.toContain("report");
  });

  test("74% does NOT trigger similar halt", () => {
    const { client } = makeClient({ matches: [], registry: [{ track_id: "t1", similarity_score: 74 }] });

    const res = runPipelineWithClient(noop, client, INPUT);

    expect(res.verdict).toBe("CLEAN");
  });
});

describe("fail-fast — HTTP / timeout error on any step", () => {
  for (const step of ["convert", "checkPublic", "comparePrivate", "report", "register"] as const) {
    test(`${step} failure -> ERROR, no partial state`, () => {
      const { client, calls } = makeClient({
        matches: [{ ISRC: "USRC1", confidence_score: 60 }],
        registry: [],
        failOn: step,
        error: new BackendError(`/api/${step}`, 503, `/api/${step} -> HTTP 503`),
      });

      const res = runPipelineWithClient(noop, client, INPUT);

      expect(res.verdict).toBe("ERROR");
      expect(res.reason).toContain("HTTP 503");
      // No partial state: even if a later step threw, no report is surfaced.
      expect(res.report).toBeUndefined();
      void calls;
    });
  }

  test("non-BackendError (e.g. timeout) is still caught -> ERROR", () => {
    const { client } = makeClient({ failOn: "convert", error: new Error("network timeout") });

    const res = runPipelineWithClient(noop, client, INPUT);

    expect(res.verdict).toBe("ERROR");
    expect(res.reason).toContain("timeout");
  });
});

// -------------------------------------------------------------------------
// Happy path & Step 3 conditional
// -------------------------------------------------------------------------
describe("happy path", () => {
  test("CLEAN runs Step 3 when ACRCloud match >= 50% and returns the report", () => {
    const { client, calls } = makeClient({
      matches: [{ ISRC: "USRC1", confidence_score: 68 }],
      registry: [{ track_id: "t1", similarity_score: 40 }],
      commercial: [{ ISRC: "USRC1", melodic: 70, rhythmic: 80, structural: 55 }],
    });

    const res = runPipelineWithClient(noop, client, INPUT);

    expect(res.verdict).toBe("CLEAN");
    expect(res.report).toBeDefined();
    expect(calls).toContain("compareCommercial");
    expect(calls).toContain("register");
  });

  test("Step 3 skipped when no ACRCloud match >= 50%", () => {
    const { client, calls } = makeClient({
      matches: [{ ISRC: "USRC1", confidence_score: 30 }],
      registry: [],
    });

    const res = runPipelineWithClient(noop, client, INPUT);

    expect(res.verdict).toBe("CLEAN");
    expect(calls).not.toContain("compareCommercial");
    expect(calls).toContain("report");
    expect(calls).toContain("register");
  });

  test("REJECTED does not call register", () => {
    const { client, calls } = makeClient({
      matches: [{ ISRC: "USRC1", confidence_score: 96 }],
    });

    runPipelineWithClient(noop, client, INPUT);

    expect(calls).not.toContain("register");
  });
});

describe("parsePipelineInput", () => {
  test("accepts flat PipelineInput", () => {
    expect(parsePipelineInput(INPUT).trackId).toBe(INPUT.trackId);
  });

  test("accepts wrapped { input: PipelineInput }", () => {
    expect(parsePipelineInput({ input: INPUT }).trackId).toBe(INPUT.trackId);
  });
});

describe("initWorkflow", () => {
  test("registers a single handler on the HTTP trigger", () => {
    const config: Config = {
      backendBaseUrl: "http://localhost:8080",
      useConfidentialHttp: true,
    };

    const handlers = initWorkflow(config);

    expect(handlers).toBeArray();
    expect(handlers).toHaveLength(1);
  });
});

describe("pipeline events", () => {
  test("CLEAN completion carries report and certificate fields", () => {
    const event = buildPipelineCompletionEvent(INPUT, {
      verdict: "CLEAN",
      trackId: INPUT.trackId,
      commitmentHash: INPUT.commitmentHash,
      registryRef: INPUT.registryRef,
      registryTxHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      report: REPORT,
    });

    expect(event).toEqual({
      flowId: INPUT.flowId,
      flowStatus: "pipeline_completed",
      report: REPORT,
      registryTxHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      registryRef: INPUT.registryRef,
      commitmentHash: INPUT.commitmentHash,
    });
  });

  test("blocked completion never carries Registry seal fields", () => {
    const event = buildPipelineCompletionEvent(INPUT, {
      verdict: "SIMILAR",
      trackId: INPUT.trackId,
      commitmentHash: INPUT.commitmentHash,
      registryRef: INPUT.registryRef,
      reason: "private registry match 82%",
    });

    expect(event).toEqual({
      flowId: INPUT.flowId,
      flowStatus: "pipeline_blocked",
      reason: "private registry match 82%",
      commitmentHash: INPUT.commitmentHash,
    });
  });
});
