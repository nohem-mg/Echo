import { NextResponse } from "next/server";
import { FlowStoreError, getFlow, getTrackForFlow } from "@/lib/flow-store";
import { buildFlowCommitmentHash, buildFlowRegistryRef } from "@/lib/registry-handoff";

type SealPipelineRequest = {
  flowId?: string;
};

type CreSealPayload = {
  input: {
    mode: "seal";
    flowId: string;
    audioRef: string;
    commitmentHash: `0x${string}`;
    registryRef: `0x${string}`;
    worldNullifier: string;
    trackId: `0x${string}`;
  };
};

type CreSealResult =
  | {
      status: "disabled";
      reason: string;
    }
  | {
      status: "started";
      url: string;
    }
  | {
      status: "failed";
      url: string;
      error: string;
    };

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as SealPipelineRequest;

  if (!body.flowId) {
    return NextResponse.json({ error: "Missing flowId" }, { status: 400 });
  }

  try {
    const [flow, track] = await Promise.all([getFlow(body.flowId), getTrackForFlow(body.flowId)]);

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    if (flow.status !== "pipeline_completed") {
      return NextResponse.json({ error: "Flow is not awaiting on-chain seal" }, { status: 409 });
    }

    if (flow.report?.verdict !== "CLEAN") {
      return NextResponse.json({ error: "Only CLEAN flows can be sealed on-chain" }, { status: 409 });
    }

    if (flow.registryTxHash) {
      return NextResponse.json({ flow, track, creSeal: { status: "disabled", reason: "Already sealed" } });
    }

    if (!flow.registryTrackId) {
      return NextResponse.json({ error: "Missing registryTrackId — registerTrack must run first" }, { status: 409 });
    }

    if (!track) {
      return NextResponse.json({ error: "Upload a track before sealing" }, { status: 409 });
    }

    const audioRef = track.storageUrl ?? track.storagePath ?? track.id;
    const commitmentHash = flow.commitmentHash ?? buildFlowCommitmentHash(flow.id, flow.trackFingerprint);
    const registryRef = flow.registryRef ?? buildFlowRegistryRef(track.id);

    const crePayload: CreSealPayload = {
      input: {
        mode: "seal",
        flowId: flow.id,
        audioRef,
        commitmentHash,
        registryRef,
        worldNullifier: flow.nullifierHash,
        trackId: flow.registryTrackId,
      },
    };

    const creSeal = await triggerCreSeal(crePayload);

    return NextResponse.json({
      flow,
      track,
      creInput: crePayload.input,
      creSeal,
    });
  } catch (error) {
    if (error instanceof FlowStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}

async function triggerCreSeal(payload: CreSealPayload): Promise<CreSealResult> {
  const triggerUrl = process.env.CRE_TRIGGER_URL;

  if (!triggerUrl) {
    return {
      status: "disabled",
      reason: "CRE_TRIGGER_URL is not configured",
    };
  }

  try {
    const response = await fetch(triggerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(process.env.CRE_TRIGGER_TIMEOUT_MS ?? "45000")),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`CRE seal trigger HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
    }

    return {
      status: "started",
      url: triggerUrl,
    };
  } catch (error) {
    return {
      status: "failed",
      url: triggerUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
