import { describe, expect, test } from "bun:test";
import {
  ATTESTATION_HEADER_CANDIDATES,
  createAttestationCollector,
  encodeCallbackReportPayload,
  extractAttestationFromResponse,
  requireAgentAttestation,
  verifyAgentAttestations,
} from "./attestation";
import { buildRegistryCallback } from "./callback";
import type { CONFIDENTIAL_HTTP_CLIENT_PB } from "@chainlink/cre-sdk/pb";
import type { PipelineResult } from "./types";

type HTTPResponse = CONFIDENTIAL_HTTP_CLIENT_PB.HTTPResponse;

const mockResponse = (headers: Record<string, string>, statusCode = 200): HTTPResponse =>
  ({
    statusCode,
    body: new TextEncoder().encode("{}"),
    multiHeaders: Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name, { values: [value] }]),
    ),
  }) as HTTPResponse;

describe("extractAttestationFromResponse", () => {
  test("reads the first matching attestation header", () => {
    const response = mockResponse({
      "x-chainlink-confidential-attestation": "tee-proof-abc",
    });

    const att = extractAttestationFromResponse(response, "step1-convert");

    expect(att).toEqual({ step: "step1-convert", attestation: "tee-proof-abc" });
  });

  test("falls back to alternate header names", () => {
    const response = mockResponse({ "x-attestation": "fallback-proof" });

    const att = extractAttestationFromResponse(response, "step4-report");

    expect(att?.attestation).toBe("fallback-proof");
  });

  test("returns undefined when no attestation header is present", () => {
    const response = mockResponse({ "content-type": "application/json" });

    expect(extractAttestationFromResponse(response, "step2a-check-public")).toBeUndefined();
  });
});

describe("requireAgentAttestation", () => {
  test("throws when attestation header is missing", () => {
    const response = mockResponse({});

    expect(() => requireAgentAttestation(response, "step1-convert")).toThrow(
      /missing Confidential AI attestation/,
    );
  });

  test("returns attestation when header is present", () => {
    const response = mockResponse({
      [ATTESTATION_HEADER_CANDIDATES[0]]: "valid-proof",
    });

    expect(requireAgentAttestation(response, "step1-convert").attestation).toBe("valid-proof");
  });
});

describe("verifyAgentAttestations", () => {
  test("accepts non-empty attestations", () => {
    expect(() =>
      verifyAgentAttestations([{ step: "step1-convert", attestation: "proof" }]),
    ).not.toThrow();
  });

  test("rejects empty attestation values", () => {
    expect(() => verifyAgentAttestations([{ step: "step1-convert", attestation: "  " }])).toThrow(
      /empty Confidential AI attestation/,
    );
  });
});

describe("encodeCallbackReportPayload", () => {
  const OWNER = `0x${'ab'.repeat(20)}` as const;   // valid EVM address (20 bytes)
  const COMMITMENT = `0x${'cd'.repeat(32)}` as const;
  const REGISTRY_REF = `0x${'ef'.repeat(32)}` as const;

  test("ABI-encodes owner, commitmentHash, and registryRef", () => {
    const result: PipelineResult = {
      verdict: "CLEAN",
      owner: OWNER,
      commitmentHash: COMMITMENT,
      registryRef: REGISTRY_REF,
    };

    const encoded = encodeCallbackReportPayload(result);

    expect(encoded.startsWith("0x")).toBe(true);
    // abi.encode(address, bytes32, bytes32) = 3 × 32 bytes = 96 bytes = 192 hex chars
    expect(encoded.length).toBe(2 + 192);
  });

  test("falls back to zero bytes32 when registryRef is absent", () => {
    const result: PipelineResult = {
      verdict: "CLEAN",
      owner: OWNER,
      commitmentHash: COMMITMENT,
    };

    const encoded = encodeCallbackReportPayload(result);
    expect(encoded.startsWith("0x")).toBe(true);
    expect(encoded.length).toBe(2 + 192);
  });

  test("two different owners produce different payloads", () => {
    const base: Omit<PipelineResult, "owner"> = {
      verdict: "CLEAN",
      commitmentHash: COMMITMENT,
      registryRef: REGISTRY_REF,
    };
    const enc1 = encodeCallbackReportPayload({ ...base, owner: `0x${'11'.repeat(20)}` });
    const enc2 = encodeCallbackReportPayload({ ...base, owner: `0x${'22'.repeat(20)}` });
    expect(enc1).not.toBe(enc2);
  });
});

describe("buildRegistryCallback", () => {
  test("returns callback payload for CLEAN with attestation", () => {
    const result: PipelineResult = {
      verdict: "CLEAN",
      owner: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      commitmentHash: "0xabc",
      attestation: "0xdeadbeef",
    };

    expect(buildRegistryCallback(result)).toEqual({
      owner: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      commitmentHash: "0xabc",
      attestation: "0xdeadbeef",
    });
  });

  test("returns undefined for SIMILAR and REJECTED with attestation", () => {
    const base = { owner: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", commitmentHash: "0xabc", attestation: "0xproof" };
    expect(buildRegistryCallback({ ...base, verdict: "SIMILAR" })).toBeUndefined();
    expect(buildRegistryCallback({ ...base, verdict: "REJECTED" })).toBeUndefined();
  });

  test("returns undefined for ERROR or missing attestation", () => {
    expect(buildRegistryCallback({ verdict: "ERROR", owner: "0x1", commitmentHash: "0xabc" })).toBeUndefined();
    expect(buildRegistryCallback({ verdict: "CLEAN", owner: "0x1", commitmentHash: "0xabc" })).toBeUndefined();
  });
});

describe("createAttestationCollector", () => {
  test("accumulates agent attestations in order", () => {
    const collector = createAttestationCollector();
    collector.push({ step: "a", attestation: "1" });
    collector.push({ step: "b", attestation: "2" });

    expect(collector.list()).toEqual([
      { step: "a", attestation: "1" },
      { step: "b", attestation: "2" },
    ]);
  });
});
