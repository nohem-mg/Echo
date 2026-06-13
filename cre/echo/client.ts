// ==========================================================================
// Echo — Pipeline client abstraction
// --------------------------------------------------------------------------
// Wraps the six backend steps behind an interface so the DAG logic in
// main.ts can be unit-tested without any network / CRE runtime (inject a
// fake client). The real implementation delegates to steps.ts or, when
// useConfidentialHttp is enabled, to confidential-steps.ts (TEE agents).
// Each method returns a Deferred so callers can parallelize (2A ∥ 2B).
// ==========================================================================

import type { Runtime } from "@chainlink/cre-sdk";
import type { Deferred } from "./backend";
import {
  createConfidentialContext,
  type ConfidentialClientContext,
  type ConfidentialClientOptions,
} from "./confidential-backend";
import {
  stepCheckPublicConfidential,
  stepConvertConfidential,
  stepReportConfidential,
} from "./confidential-steps";
import {
  stepCheckPublic,
  stepCompareCommercial,
  stepComparePrivate,
  stepConvert,
  stepRegister,
  stepReport,
} from "./steps";
import type {
  AgentAttestation,
  CheckPublicResponse,
  CommercialDelta,
  CompareCommercialResponse,
  ComparePrivateResponse,
  ConvertResponse,
  RegisterResponse,
  RegistryMatch,
  ReportResponse,
} from "./types";

export type ReportArgs = {
  audioRef: string;
  midiSequence: string;
  registry_matches: RegistryMatch[];
  commercial_deltas: CommercialDelta[];
};

// One method per backend endpoint; all deferred for parallel scheduling.
export type PipelineClient = {
  convert(audioRef: string): Deferred<ConvertResponse>;
  checkPublic(audioRef: string): Deferred<CheckPublicResponse>;
  comparePrivate(midiSequence: string): Deferred<ComparePrivateResponse>;
  compareCommercial(midiSequence: string, ISRCs: string[]): Deferred<CompareCommercialResponse>;
  report(args: ReportArgs): Deferred<ReportResponse>;
  register(args: {
    trackId: string;
    midiSequence: string;
    fingerprint?: string;
  }): Deferred<RegisterResponse>;
  getAgentAttestations(): readonly AgentAttestation[];
};

export type BackendClientOptions = {
  useConfidentialHttp?: boolean;
  secretsOwner?: string;
};

// Real client bound to a CRE runtime + backend base URL.
export function createBackendClient<C>(
  runtime: Runtime<C>,
  baseUrl: string,
  options: BackendClientOptions = {},
): PipelineClient {
  const confidentialCtx: ConfidentialClientContext | undefined = options.useConfidentialHttp
    ? createConfidentialContext()
    : undefined;
  const confidentialOptions: ConfidentialClientOptions = {
    secretsOwner: options.secretsOwner,
  };

  if (confidentialCtx) {
    const ctx = confidentialCtx;
    // Agents A/B (raw audio) → ConfidentialHTTPClient (TEE + attestation).
    // Steps C–E + registry pass midiSequence produced inside the workflow; the
    // confidential bodyString template cannot embed dynamic JSON safely, so
    // they use the regular HTTP client (still node-mode + consensus).
    return {
      convert: (audioRef) => stepConvertConfidential(runtime, baseUrl, audioRef, ctx, confidentialOptions),
      checkPublic: (audioRef) =>
        stepCheckPublicConfidential(runtime, baseUrl, audioRef, ctx, confidentialOptions),
      comparePrivate: (midiSequence) => stepComparePrivate(runtime, baseUrl, midiSequence),
      compareCommercial: (midiSequence, ISRCs) =>
        stepCompareCommercial(runtime, baseUrl, midiSequence, ISRCs),
      report: (args) => stepReportConfidential(runtime, baseUrl, args, ctx, confidentialOptions),
      register: (args) => stepRegister(runtime, baseUrl, args),
      getAgentAttestations: () => ctx.collector.list(),
    };
  }

  return {
    convert: (audioRef) => stepConvert(runtime, baseUrl, audioRef),
    checkPublic: (audioRef) => stepCheckPublic(runtime, baseUrl, audioRef),
    comparePrivate: (midiSequence) => stepComparePrivate(runtime, baseUrl, midiSequence),
    compareCommercial: (midiSequence, ISRCs) =>
      stepCompareCommercial(runtime, baseUrl, midiSequence, ISRCs),
    report: (args) => stepReport(runtime, baseUrl, args),
    register: (args) => stepRegister(runtime, baseUrl, args),
    getAgentAttestations: () => [],
  };
}
