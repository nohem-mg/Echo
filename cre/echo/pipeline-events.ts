// ==========================================================================
// Echo — Frontend pipeline event notifier
// --------------------------------------------------------------------------
// Internal, additive bridge for persisted UI state. Event delivery is best
// effort: failing to update the UI store must not change the CRE verdict.
// ==========================================================================

import {
  HTTPClient,
  consensusIdenticalAggregation,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk";
import type { PipelineInput, PipelineResult, ReportResponse, Verdict } from "./types";

export type PipelineEventsConfig = {
  /** Internal Next.js endpoint, e.g. https://app.example.com/api/pipeline/events. */
  pipelineEventsUrl?: string;
  /** Bearer secret shared with ECHO_PIPELINE_SECRET. Never commit a real value. */
  pipelineEventsSecret?: string;
  pipelineEventsTimeoutMs?: number;
};

export type PipelineStepEvent = {
  stepKey: string;
  status?: "queued" | "running" | "done" | "blocked" | "error";
  progress?: number;
  meta?: string | null;
  reason?: string | null;
  detail?: string;
};

export type PipelineCompletionEvent = {
  flowId: string;
  flowStatus: "pipeline_completed" | "pipeline_blocked" | "error";
  reason?: string;
  report?: ReportResponse;
  registryTrackId?: string;
  registryTxHash?: string;
  registryRef?: string;
  commitmentHash?: string;
};

export type PipelineEventSink = {
  updateStep(input: PipelineInput, event: PipelineStepEvent): void;
};

export const noopPipelineEvents: PipelineEventSink = {
  updateStep: () => undefined,
};

const DEFAULT_PIPELINE_EVENT_TIMEOUT_MS = 10_000;
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function createPipelineEventSink<C extends PipelineEventsConfig>(
  runtime: Runtime<C>,
  config: PipelineEventsConfig,
): PipelineEventSink {
  const enabled = Boolean(config.pipelineEventsUrl && config.pipelineEventsSecret);

  if (!enabled) {
    return noopPipelineEvents;
  }

  return {
    updateStep(input, event) {
      if (!input.flowId) {
        return;
      }

      // CRE sim HTTPAction.CallLimit defaults to 15; skip transient "running" pings.
      if (event.status === "running") {
        return;
      }

      postPipelineEvent(runtime, config, {
        flowId: input.flowId,
        ...event,
      });
    },
  };
}

export function notifyPipelineCompletion<C extends PipelineEventsConfig>(
  runtime: Runtime<C>,
  config: PipelineEventsConfig,
  input: PipelineInput,
  result: PipelineResult,
): void {
  const payload = buildPipelineCompletionEvent(input, result);
  if (!payload || !config.pipelineEventsUrl || !config.pipelineEventsSecret) {
    return;
  }

  postPipelineEvent(runtime, config, payload);
}

export function buildPipelineCompletionEvent(
  input: PipelineInput,
  result: PipelineResult,
): PipelineCompletionEvent | undefined {
  if (!input.flowId) {
    return undefined;
  }

  const flowStatus = toFlowStatus(result.verdict);
  const cleanSeal = result.verdict === "CLEAN";

  return pruneUndefined({
    flowId: input.flowId,
    flowStatus,
    reason: result.reason,
    report: result.report,
    registryTxHash: cleanSeal ? result.registryTxHash : undefined,
    registryRef: cleanSeal ? result.registryRef ?? input.registryRef : undefined,
    commitmentHash: result.commitmentHash,
  });
}

function postPipelineEvent<C extends PipelineEventsConfig>(
  runtime: Runtime<C>,
  config: PipelineEventsConfig,
  payload: Record<string, unknown>,
): void {
  const url = config.pipelineEventsUrl;
  const secret = config.pipelineEventsSecret;
  if (!url || !secret) {
    return;
  }

  const body = JSON.stringify(pruneUndefined(payload));
  const timeoutMs = config.pipelineEventsTimeoutMs ?? DEFAULT_PIPELINE_EVENT_TIMEOUT_MS;

  try {
    const sendInNode = (nodeRuntime: NodeRuntime<C>): string => {
      const http = new HTTPClient();
      const response = http
        .sendRequest(nodeRuntime, {
          url,
          method: "POST",
          body: new TextEncoder().encode(body),
          headers: {
            Authorization: `Bearer ${secret}`,
            "content-type": "application/json",
          },
          timeout: `${Math.floor(timeoutMs / 1000)}s`,
        })
        .result();

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`/api/pipeline/events -> HTTP ${response.statusCode}`);
      }

      // Keep consensus independent from non-deterministic response timestamps.
      return "ok";
    };

    runtime.runInNodeMode(sendInNode, consensusIdenticalAggregation<string>())().result();
  } catch (err) {
    runtime.log(`Pipeline event update failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function toFlowStatus(verdict: Verdict): PipelineCompletionEvent["flowStatus"] {
  if (verdict === "CLEAN") {
    return "pipeline_completed";
  }

  if (verdict === "ERROR") {
    return "error";
  }

  return "pipeline_blocked";
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ZERO_HASH),
  ) as T;
}
