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
  test("ABI-encodes verdict, commitmentHash, and agent attestations", () => {
    const result: PipelineResult = {
      verdict: "CLEAN",
      commitmentHash: `0x${"ab".repeat(32)}`,
      agentAttestations: [
        { step: "step1-convert", attestation: "proof-a" },
        { step: "step4-report", attestation: "proof-b" },
      ],
    };

    const encoded = encodeCallbackReportPayload(result, result.agentAttestations ?? []);

    expect(encoded.startsWith("0x")).toBe(true);
    expect(encoded.length).toBeGreaterThan(10);
  });
});

describe("buildRegistryCallback", () => {
  test("returns callback payload only for CLEAN with attestation", () => {
    const result: PipelineResult = {
      verdict: "CLEAN",
      commitmentHash: "0xabc",
      attestation: "0xdeadbeef",
    };

    expect(buildRegistryCallback(result)).toEqual({
      verdict: "CLEAN",
      commitmentHash: "0xabc",
      attestation: "0xdeadbeef",
    });
  });

  test("returns undefined for halts without attestation", () => {
    expect(buildRegistryCallback({ verdict: "REJECTED", commitmentHash: "0xabc" })).toBeUndefined();
    expect(buildRegistryCallback({ verdict: "CLEAN", commitmentHash: "0xabc" })).toBeUndefined();
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
