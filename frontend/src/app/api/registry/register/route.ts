import { NextResponse } from "next/server";
import {
  confirmFlowRegistryRegistration,
  FlowStoreError,
  getPipelineSteps,
  getTrackForFlow,
  toSafeErrorMessage,
} from "@/lib/flow-store";

type RegistryRegisterRequest = {
  flowId?: string;
  registryTrackId?: `0x${string}`;
  commitmentHash?: `0x${string}`;
  registryRef?: `0x${string}`;
};

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as RegistryRegisterRequest;

  if (!body.flowId || !body.registryTrackId || !body.commitmentHash || !body.registryRef) {
    return NextResponse.json(
      { error: "Missing flowId, registryTrackId, commitmentHash, or registryRef" },
      { status: 400 },
    );
  }

  try {
    const flow = await confirmFlowRegistryRegistration({
      flowId: body.flowId,
      registryTrackId: body.registryTrackId,
      commitmentHash: body.commitmentHash,
      registryRef: body.registryRef,
    });
    const [track, pipeline] = await Promise.all([getTrackForFlow(body.flowId), getPipelineSteps(body.flowId)]);

    return NextResponse.json({ flow, track, pipeline });
  } catch (error) {
    if (error instanceof FlowStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Registry registration persist failed",
        details: toSafeErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
