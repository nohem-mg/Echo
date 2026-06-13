import { NextResponse } from "next/server";
import { FlowStoreError, getFlow, getTrackForFlow, initializePipeline } from "@/lib/flow-store";

type StartPipelineRequest = {
  flowId?: string;
  trackId?: string;
};

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as StartPipelineRequest;

  if (!body.flowId) {
    return NextResponse.json({ error: "Missing flowId" }, { status: 400 });
  }

  try {
    const [flow, track] = await Promise.all([getFlow(body.flowId), getTrackForFlow(body.flowId)]);

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    if (!track) {
      return NextResponse.json({ error: "Upload a track before starting analysis" }, { status: 409 });
    }

    if (body.trackId && body.trackId !== track.id) {
      return NextResponse.json({ error: "trackId does not match this flow" }, { status: 409 });
    }

    const pipeline = await initializePipeline({ flowId: flow.id, trackId: track.id });
    const updatedFlow = (await getFlow(flow.id)) ?? flow;

    return NextResponse.json({
      flow: updatedFlow,
      track,
      pipeline,
      analysisInput: {
        flowId: flow.id,
        trackId: track.id,
        fingerprint: track.fingerprint,
        storageProvider: track.storageProvider,
        storagePath: track.storagePath,
        storageUrl: track.storageUrl,
      },
      next: {
        owner: "backend_pipeline",
        expectedEndpoints: ["/api/convert", "/api/check/public", "/api/compare/private", "/api/compare/commercial", "/api/report"],
      },
    });
  } catch (error) {
    if (error instanceof FlowStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}
