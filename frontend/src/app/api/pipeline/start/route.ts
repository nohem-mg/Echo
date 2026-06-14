import { NextResponse } from "next/server";
import { FlowStoreError, getFlow, getTrackForFlow, initializePipeline } from "@/lib/flow-store";
import {
  buildFlowCommitmentHash,
  buildFlowRegistryRef,
  deriveOwnerKey,
} from "@/lib/registry-handoff";
import type { EchoFlow, EchoTrack } from "@/lib/types";

type StartPipelineRequest = {
  flowId?: string;
  trackId?: string;
  owner?: `0x${string}`;
  agentkitHeader?: string;
};

type CreTriggerPayload = {
  input: {
    flowId: string;
    audioRef: string;
    commitmentHash: `0x${string}`;
    registryRef: `0x${string}`;
    /** Artist's ephemeral owner-key address (never their real wallet). */
    owner: `0x${string}`;
    /** Signed AgentKit header from the frontend wallet; forwarded to /api/report. */
    agentkitHeader?: string;
  };
};

type CreTriggerResult =
  | {
      status: "disabled";
      reason: string;
    }
  | {
      status: "started";
      url: string;
      commitmentHashSource: "flow" | "provisional_fingerprint";
      registryRefSource: "flow" | "provisional_upload_id";
    }
  | {
      status: "failed";
      url: string;
      error: string;
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

    const pipeline = await initializePipeline({
      flowId: flow.id,
      trackId: track.id,
      ownerAddress: body.owner,
    });
    const updatedFlow = (await getFlow(flow.id)) ?? flow;
    const audioRef = track.storageUrl ?? track.storagePath ?? track.id;
    const { payload: crePayload, sources: creInputSources } = buildCreTriggerPayload(updatedFlow, track, audioRef, body.owner, body.agentkitHeader);
    const creTrigger = await triggerCrePipeline(crePayload, creInputSources);

    return NextResponse.json({
      flow: updatedFlow,
      track,
      pipeline,
      analysisInput: {
        flowId: flow.id,
        uploadTrackId: track.id,
        trackId: track.id,
        fingerprint: track.fingerprint,
        storageProvider: track.storageProvider,
        storagePath: track.storagePath,
        storageUrl: track.storageUrl,
      },
      creInput: crePayload.input,
      creInputSources,
      creTrigger,
      next: {
        owner: "backend_pipeline",
        expectedEndpoints: ["/api/convert", "/api/check/public", "/api/compare/private", "/api/compare/commercial", "/api/report"],
        pipelineEventEndpoint: "/api/pipeline/events",
        pipelineEventAuth: "Authorization: Bearer ${ECHO_PIPELINE_SECRET}",
      },
    });
  } catch (error) {
    if (error instanceof FlowStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}

function buildCreTriggerPayload(flow: EchoFlow, track: EchoTrack, audioRef: string, clientOwner?: `0x${string}`, agentkitHeader?: string) {
  const commitmentHash = flow.commitmentHash ?? buildFlowCommitmentHash(flow.id, flow.trackFingerprint);
  const registryRef = flow.registryRef ?? buildFlowRegistryRef(track.id);

  // Derive the ephemeral owner-key address. In production the browser derives
  // this by signing a fixed message with the real wallet; server-side we use
  // a deterministic SHA-256 derivation so the pipeline can always proceed.
  const owner = clientOwner ?? flow.ownerAddress ?? deriveOwnerKey(flow.walletAddress, flow.nullifierHash);

  return {
    payload: {
      input: {
        flowId: flow.id,
        audioRef,
        commitmentHash,
        registryRef,
        owner,
        ...(agentkitHeader ? { agentkitHeader } : {}),
      },
    } satisfies CreTriggerPayload,
    sources: {
      commitmentHashSource: flow.commitmentHash ? ("flow" as const) : ("provisional_fingerprint" as const),
      registryRefSource: flow.registryRef ? ("flow" as const) : ("provisional_upload_id" as const),
    },
  };
}

async function triggerCrePipeline(
  payload: CreTriggerPayload,
  sources: ReturnType<typeof buildCreTriggerPayload>["sources"],
): Promise<CreTriggerResult> {
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
      throw new Error(`CRE trigger HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
    }

    return {
      status: "started",
      url: triggerUrl,
      ...sources,
    };
  } catch (error) {
    return {
      status: "failed",
      url: triggerUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
