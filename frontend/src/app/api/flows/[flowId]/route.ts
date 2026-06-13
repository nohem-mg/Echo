import { NextResponse } from "next/server";
import { FlowStoreError, getFlow } from "@/lib/flow-store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ flowId: string }> }): Promise<Response> {
  const { flowId } = await params;

  try {
    const flow = await getFlow(flowId);

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    return NextResponse.json({ flow });
  } catch (error) {
    if (error instanceof FlowStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}
