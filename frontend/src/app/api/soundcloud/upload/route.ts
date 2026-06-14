import { promises as fs } from "node:fs";
import { get as getBlob } from "@vercel/blob";
import { NextResponse } from "next/server";
import { FlowStoreError, getFlow, getTrackForFlow, toSafeErrorMessage } from "@/lib/flow-store";
import type { EchoFlow, EchoTrack } from "@/lib/types";

type SoundCloudUploadRequest = {
  flowId?: string;
  title?: string;
  description?: string;
  privacy?: "private" | "public";
  accessToken?: string;
  refreshToken?: string;
};

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request): Promise<Response> {
  try {
    const input = (await request.json()) as SoundCloudUploadRequest;
    const validation = validatePublishRequest(input);

    if (validation) {
      return NextResponse.json({ error: validation }, { status: 400 });
    }

    const flowId = input.flowId!.trim();
    const [flow, track] = await Promise.all([getFlow(flowId), getTrackForFlow(flowId)]);

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    if (!track) {
      return NextResponse.json({ error: "Uploaded track not found for this flow" }, { status: 404 });
    }

    const readinessError = getSoundCloudReadinessError(flow, track);
    if (readinessError) {
      return NextResponse.json({ error: readinessError.message }, { status: readinessError.status });
    }

    const audioBuffer = await readStoredAudio(track);
    const accessToken = resolveSoundCloudAccessToken(input.accessToken);
    const refreshToken = resolveSoundCloudRefreshToken(input.refreshToken);
    const metadata = {
      title: input.title!.trim(),
      description: input.description?.trim() ?? "",
      privacy: input.privacy ?? "private",
      ...(accessToken ? { access_token: accessToken } : {}),
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
    };

    const upstreamBody = new FormData();
    upstreamBody.append("file", new Blob([audioBuffer], { type: track.contentType }), track.fileName);
    upstreamBody.append("metadata", JSON.stringify(metadata));

    const response = await fetch(getSoundCloudUploadUrl(), {
      method: "POST",
      body: upstreamBody,
      signal: AbortSignal.timeout(90_000),
    });
    const payload = await readUpstreamPayload(response);

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    if (error instanceof FlowStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "SoundCloud publish failed",
        details: toSafeErrorMessage(error),
      },
      { status: 500 },
    );
  }
}

function validatePublishRequest(input: SoundCloudUploadRequest) {
  if (!input.flowId?.trim()) {
    return "Missing flowId";
  }

  if (!input.title?.trim()) {
    return "Missing SoundCloud title";
  }

  if (input.title.trim().length > 255) {
    return "SoundCloud title is too long";
  }

  if ((input.description?.length ?? 0) > 10_000) {
    return "SoundCloud description is too long";
  }

  if (input.privacy && input.privacy !== "private" && input.privacy !== "public") {
    return "SoundCloud privacy must be private or public";
  }

  return null;
}

function getSoundCloudReadinessError(flow: EchoFlow, track: EchoTrack) {
  if (flow.status !== "pipeline_completed" || !flow.registryTxHash) {
    return new FlowStoreError("SoundCloud publish requires a confirmed Registry seal", 409);
  }

  if (flow.report?.verdict !== "CLEAN") {
    return new FlowStoreError("SoundCloud publish is only available for CLEAN tracks", 409);
  }

  if (flow.trackFingerprint !== track.fingerprint) {
    return new FlowStoreError("Stored audio does not match the verified flow fingerprint", 409);
  }

  return null;
}

async function readStoredAudio(track: EchoTrack) {
  if (track.storageProvider === "local_file") {
    if (!track.storagePath) {
      throw new FlowStoreError("Local audio path missing for stored track", 500);
    }

    return fs.readFile(track.storagePath);
  }

  const blobRef = track.storagePath ?? track.storageUrl;
  if (!blobRef) {
    throw new FlowStoreError("Blob reference missing for stored track", 500);
  }

  const blob = await getBlob(blobRef, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  if (!blob?.stream) {
    throw new FlowStoreError("Stored audio blob not found", 404);
  }

  return Buffer.from(await new Response(blob.stream).arrayBuffer());
}

function resolveSoundCloudAccessToken(inputToken?: string) {
  return (
    inputToken?.trim() ||
    process.env.ECHO_SC_ACCESS_TOKEN?.trim() ||
    process.env.SOUNDCLOUD_ACCESS_TOKEN?.trim() ||
    ""
  );
}

function resolveSoundCloudRefreshToken(inputToken?: string) {
  return (
    inputToken?.trim() ||
    process.env.ECHO_SC_REFRESH_TOKEN?.trim() ||
    process.env.SOUNDCLOUD_REFRESH_TOKEN?.trim() ||
    ""
  );
}

function getSoundCloudUploadUrl() {
  const explicit = process.env.SOUNDCLOUD_UPLOAD_URL ?? process.env.ECHO_SOUNDCLOUD_UPLOAD_URL;
  if (explicit) {
    return explicit;
  }

  const baseUrl = process.env.ECHO_SOUNDCLOUD_URL ?? "http://127.0.0.1:8080";
  return `${baseUrl.replace(/\/$/, "")}/api/soundcloud/upload`;
}

async function readUpstreamPayload(response: Response) {
  const raw = await response.text();

  if (!raw.trim()) {
    return response.ok
      ? {}
      : { error: response.statusText || "SoundCloud service returned an empty error response" };
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return response.ok
      ? { message: raw.trim().slice(0, 240) }
      : { error: raw.trim().slice(0, 240) };
  }
}
