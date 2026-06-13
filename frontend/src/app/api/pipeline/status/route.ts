import { NextResponse } from "next/server";
import { FlowStoreError, getFlow, getPipelineSteps, getTrackForFlow } from "@/lib/flow-store";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const flowId = searchParams.get("flowId")?.trim();

  if (!flowId) {
    return NextResponse.json({ error: "Missing flowId" }, { status: 400 });
  }

  try {
    const [flow, track, pipeline] = await Promise.all([getFlow(flowId), getTrackForFlow(flowId), getPipelineSteps(flowId)]);

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    return NextResponse.json({
      flow,
      track,
      pipeline,
    });
  } catch (error) {
    if (error instanceof FlowStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}
