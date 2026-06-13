import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FlowStoreError, getFlow, getTrackForFlow, initializePipeline } from "@/lib/flow-store";
import type { EchoFlow, EchoTrack } from "@/lib/types";

type StartPipelineRequest = {
  flowId?: string;
  trackId?: string;
};

type CreTriggerPayload = {
  input: {
    flowId: string;
    audioRef: string;
    commitmentHash: `0x${string}`;
    registryRef: `0x${string}`;
    worldNullifier: string;
    trackId: `0x${string}`;
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
      trackIdSource: "registry" | "provisional_upload_id";
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

    const pipeline = await initializePipeline({ flowId: flow.id, trackId: track.id });
    const updatedFlow = (await getFlow(flow.id)) ?? flow;
    const audioRef = track.storageUrl ?? track.storagePath ?? track.id;
    const { payload: crePayload, sources: creInputSources } = buildCreTriggerPayload(updatedFlow, track, audioRef);
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

function buildCreTriggerPayload(flow: EchoFlow, track: EchoTrack, audioRef: string) {
  const commitmentHash = flow.commitmentHash ?? toBytes32(`commitment:${flow.trackFingerprint}:${flow.id}`);
  const registryRef = flow.registryRef ?? toBytes32(`registry-ref:${track.id}`);
  const registryTrackId = flow.registryTrackId ?? toBytes32(`registry-track:${track.id}`);

  return {
    payload: {
      input: {
        flowId: flow.id,
        audioRef,
        commitmentHash,
        registryRef,
        worldNullifier: flow.nullifierHash,
        trackId: registryTrackId,
      },
    } satisfies CreTriggerPayload,
    sources: {
      trackIdSource: flow.registryTrackId ? "registry" : "provisional_upload_id",
      commitmentHashSource: flow.commitmentHash ? "flow" : "provisional_fingerprint",
      registryRefSource: flow.registryRef ? "flow" : "provisional_upload_id",
    } as const,
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

function toBytes32(value: string): `0x${string}` {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}
