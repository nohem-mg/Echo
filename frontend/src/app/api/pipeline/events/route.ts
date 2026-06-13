import { NextResponse } from "next/server";
import {
  blockPipeline,
  completePipeline,
  FlowStoreError,
  getFlow,
  getPipelineSteps,
  getTrackForFlow,
  toSafeErrorMessage,
  updatePipelineOutcome,
  updatePipelineStep,
} from "@/lib/flow-store";
import type { EchoFlowStatus, EchoPipelineStatus, EchoReport } from "@/lib/types";

type PipelineEventRequest = {
  flowId?: string;
  stepKey?: string;
  status?: EchoPipelineStatus;
  flowStatus?: Extract<EchoFlowStatus, "pipeline_completed" | "pipeline_blocked" | "error">;
  progress?: number;
  meta?: string | null;
  reason?: string | null;
  detail?: string;
  report?: EchoReport;
  registryTrackId?: `0x${string}`;
  registryTxHash?: `0x${string}`;
  registryRef?: `0x${string}`;
  commitmentHash?: `0x${string}`;
};

const PIPELINE_FLOW_STATUSES = new Set(["pipeline_completed", "pipeline_blocked", "error"]);

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const authError = authenticatePipelineEvent(request);
  if (authError) {
    return authError;
  }

  const body = (await request.json().catch(() => ({}))) as PipelineEventRequest;

  if (!body.flowId) {
    return NextResponse.json({ error: "Missing flowId" }, { status: 400 });
  }

  try {
    let step = null;
    if (body.stepKey) {
      step = await updatePipelineStep({
        flowId: body.flowId,
        stepKey: body.stepKey,
        status: body.status,
        progress: body.progress,
        meta: body.meta,
        reason: body.reason,
        detail: body.detail,
      });
    }

    const flowStatus = resolveFlowStatus(body);
    if (flowStatus === "pipeline_completed") {
      await completePipeline({
        flowId: body.flowId,
        report: body.report,
        registryTrackId: body.registryTrackId,
        registryTxHash: body.registryTxHash,
        registryRef: body.registryRef,
        commitmentHash: body.commitmentHash,
        clearRegistryTxHash: !body.registryTxHash,
      });
    } else if (flowStatus === "pipeline_blocked") {
      await blockPipeline({
        flowId: body.flowId,
        report: body.report,
        registryTrackId: body.registryTrackId,
        registryTxHash: body.registryTxHash,
        registryRef: body.registryRef,
        commitmentHash: body.commitmentHash,
        reason: body.reason ?? body.report?.verdict ?? "Pipeline blocked",
      });
    } else if (flowStatus === "error") {
      await updatePipelineOutcome(body.flowId, "error", {
        flowId: body.flowId,
        report: body.report,
        registryTrackId: body.registryTrackId,
        registryTxHash: body.registryTxHash,
        registryRef: body.registryRef,
        commitmentHash: body.commitmentHash,
        reason: body.reason ?? "Pipeline failed",
      });
    }

    const [flow, track, pipeline] = await Promise.all([getFlow(body.flowId), getTrackForFlow(body.flowId), getPipelineSteps(body.flowId)]);

    return NextResponse.json({
      success: true,
      flow,
      track,
      pipeline,
      step,
    });
  } catch (error) {
    if (error instanceof FlowStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Pipeline event failed",
        details: toSafeErrorMessage(error),
      },
      { status: 500 },
    );
  }
}

function authenticatePipelineEvent(request: Request) {
  const secret = process.env.ECHO_PIPELINE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing ECHO_PIPELINE_SECRET" }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const headerSecret = request.headers.get("x-echo-pipeline-secret");

  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized pipeline event" }, { status: 401 });
  }

  return null;
}

function resolveFlowStatus(body: PipelineEventRequest) {
  if (body.flowStatus && PIPELINE_FLOW_STATUSES.has(body.flowStatus)) {
    return body.flowStatus;
  }

  if (body.report?.verdict === "CLEAN") {
    return "pipeline_completed";
  }

  if (body.report?.verdict === "SIMILAR" || body.report?.verdict === "REJECTED") {
    return "pipeline_blocked";
  }

  return undefined;
}
