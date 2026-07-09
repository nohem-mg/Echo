import { NextResponse } from "next/server";
import { FlowStoreError, getFlow, getPipelineSteps, getTrackForFlow, toSafeErrorMessage } from "@/lib/flow-store";

/**
 * Turns a thrown error into a route response.
 * - `FlowStoreError` → its own status and message.
 * - Otherwise, with a `fallback`, a 500 carrying that label + a sanitized detail.
 * - Otherwise, rethrows (let the framework produce the 500).
 */
export function handleRouteError(
  error: unknown,
  fallback?: { message: string; log?: boolean },
): NextResponse {
  if (error instanceof FlowStoreError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (fallback) {
    if (fallback.log) {
      console.error(fallback.message, error);
    }
    return NextResponse.json(
      { error: fallback.message, details: toSafeErrorMessage(error) },
      { status: 500 },
    );
  }

  throw error;
}

/** Loads the flow + its track + pipeline steps in parallel (shared read shape). */
export async function loadFlowBundle(flowId: string) {
  const [flow, track, pipeline] = await Promise.all([
    getFlow(flowId),
    getTrackForFlow(flowId),
    getPipelineSteps(flowId),
  ]);
  return { flow, track, pipeline };
}
