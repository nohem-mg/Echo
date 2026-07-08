import { NextResponse } from "next/server";
import { handleRouteError, loadFlowBundle } from "@/lib/api-route";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ flowId: string }> }): Promise<Response> {
  const { flowId } = await params;

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
