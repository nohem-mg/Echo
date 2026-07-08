import { NextResponse } from "next/server";
import { handleRouteError, loadFlowBundle } from "@/lib/api-route";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const flowId = searchParams.get("flowId")?.trim();

  if (!flowId) {
    return NextResponse.json({ error: "Missing flowId" }, { status: 400 });
  }

  try {
    const bundle = await loadFlowBundle(flowId);

    if (!bundle.flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    return NextResponse.json(bundle);
  } catch (error) {
    return handleRouteError(error);
  }
}
