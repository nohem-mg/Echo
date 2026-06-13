// ==========================================================================
// Echo — Pipeline client abstraction
// --------------------------------------------------------------------------
// Wraps the five backend steps behind an interface so the DAG logic in
// main.ts can be unit-tested without any network / CRE runtime (inject a
// fake client). The real implementation delegates to steps.ts.
// Each method returns a Deferred so callers can parallelize (2A ∥ 2B).
// ==========================================================================

import type { Runtime } from "@chainlink/cre-sdk";
import type { Deferred } from "./backend";
import {
  stepCheckPublic,
  stepCompareCommercial,
  stepComparePrivate,
  stepConvert,
  stepReport,
} from "./steps";
import type {
  CheckPublicResponse,
  CommercialDelta,
  CompareCommercialResponse,
  ComparePrivateResponse,
  ConvertResponse,
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
};

// Real client bound to a CRE runtime + backend base URL.
export function createBackendClient<C>(runtime: Runtime<C>, baseUrl: string): PipelineClient {
  return {
    convert: (audioRef) => stepConvert(runtime, baseUrl, audioRef),
    checkPublic: (audioRef) => stepCheckPublic(runtime, baseUrl, audioRef),
    comparePrivate: (midiSequence) => stepComparePrivate(runtime, baseUrl, midiSequence),
    compareCommercial: (midiSequence, ISRCs) =>
      stepCompareCommercial(runtime, baseUrl, midiSequence, ISRCs),
    report: (args) => stepReport(runtime, baseUrl, args),
  };
}
