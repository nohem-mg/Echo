import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { createTrackId, FlowStoreError, getFlow, getTrackForFlow, initializePipeline, saveTrackUpload, toSafeErrorMessage } from "@/lib/flow-store";
import type { EchoFlow, TrackUploadResponse } from "@/lib/types";

const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav"]);
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");
const MB = 1024 * 1024;

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const flowId = getTextField(formData, "flowId");
    const clientFingerprint = getTextField(formData, "fingerprint");
    const file = getFileField(formData, "file");

    if (!flowId) {
      return NextResponse.json({ error: "Missing flowId" }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    const fileName = sanitizeFileName(file.name);
    const contentType = normalizeContentType(file.type, fileName);
    const maxUploadBytes = getMaxUploadBytes();

    if (!isAllowedAudioFile(fileName, contentType)) {
      return NextResponse.json({ error: "Unsupported audio format. Use WAV or MP3." }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }

    if (file.size > maxUploadBytes) {
      return NextResponse.json(
        {
          error: `Audio file is too large. Max upload is ${Math.floor(maxUploadBytes / MB)} MB for this endpoint.`,
        },
        { status: 413 },
      );
    }

    const [flow, existingTrack, buffer] = await Promise.all([
      getFlow(flowId),
      getTrackForFlow(flowId),
      file.arrayBuffer().then((arrayBuffer) => Buffer.from(arrayBuffer)),
    ]);

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    const serverFingerprint = createAudioFingerprint(buffer);

    if (clientFingerprint && clientFingerprint !== serverFingerprint) {
      return NextResponse.json({ error: "Client fingerprint does not match uploaded audio" }, { status: 409 });
    }

    const flowReadinessError = getFlowUploadError(flow, serverFingerprint);

    if (flowReadinessError) {
      return NextResponse.json({ error: flowReadinessError.message }, { status: flowReadinessError.status });
    }

    if (existingTrack) {
      const pipeline = await initializePipeline({ flowId, trackId: existingTrack.id });
      const updatedFlow = (await getFlow(flowId)) ?? flow;
      return NextResponse.json({
        flow: updatedFlow,
        track: existingTrack,
        pipeline,
        analysis: {
          status: "queued",
          entrypoint: "/api/pipeline/start",
        },
      } satisfies TrackUploadResponse);
    }

    const trackId = createTrackId();
    const storage = await storeAudioBlob({
      buffer,
      contentType,
      extension: getSafeExtension(fileName, contentType),
      flowId,
      trackId,
    });
    const track = await saveTrackUpload({
      id: trackId,
      flowId,
      fileName,
      contentType,
      sizeBytes: buffer.byteLength,
      fingerprint: serverFingerprint,
      ...storage,
    });
    const pipeline = await initializePipeline({ flowId, trackId: track.id });
    const updatedFlow = (await getFlow(flowId)) ?? flow;

    return NextResponse.json({
      flow: updatedFlow,
      track,
      pipeline,
      analysis: {
        status: "queued",
        entrypoint: "/api/pipeline/start",
      },
    } satisfies TrackUploadResponse);
  } catch (error) {
    if (error instanceof FlowStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Track upload failed",
        details: toSafeErrorMessage(error),
      },
      { status: 500 },
    );
  }
}

function getTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getFileField(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!value || typeof value === "string") {
    return null;
  }

  return value;
}

function sanitizeFileName(fileName: string) {
  const fallback = "echo-track";
  const parsed = path.parse(fileName || fallback);
  const base = parsed.name
    .normalize("NFKD")
    .replaceAll(/[^\w.-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 80);
  const extension = AUDIO_EXTENSIONS.has(parsed.ext.toLowerCase()) ? parsed.ext.toLowerCase() : "";
  return `${base || fallback}${extension}`;
}

function normalizeContentType(contentType: string, fileName: string) {
  if (contentType && contentType !== "application/octet-stream") {
    return contentType.toLowerCase();
  }

  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".mp3") {
    return "audio/mpeg";
  }

  if (extension === ".wav") {
    return "audio/wav";
  }

  return contentType || "application/octet-stream";
}

function isAllowedAudioFile(fileName: string, contentType: string) {
  const extension = path.extname(fileName).toLowerCase();
  return AUDIO_EXTENSIONS.has(extension) && AUDIO_TYPES.has(contentType);
}

function getSafeExtension(fileName: string, contentType: string) {
  const extension = path.extname(fileName).toLowerCase();

  if (AUDIO_EXTENSIONS.has(extension)) {
    return extension;
  }

  return contentType === "audio/mpeg" || contentType === "audio/mp3" ? ".mp3" : ".wav";
}

function getMaxUploadBytes() {
  const configured = Number(process.env.MAX_AUDIO_UPLOAD_MB ?? "4");
  const maxMb = Number.isFinite(configured) && configured > 0 ? configured : 4;
  return Math.floor(maxMb * MB);
}

function createAudioFingerprint(buffer: Buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function getFlowUploadError(flow: EchoFlow, fingerprint: string) {
  if (flow.trackFingerprint !== fingerprint) {
    return new FlowStoreError("Uploaded audio fingerprint does not match the verified flow", 409);
  }

  if (
    ![
      "world_verified",
      "payment_requested",
      "payment_confirmed",
      "track_uploaded",
      "pipeline_started",
      "pipeline_completed",
      "pipeline_blocked",
      "error",
    ].includes(flow.status)
  ) {
    return new FlowStoreError(`Flow cannot upload audio from status ${flow.status}`, 409);
  }

  return null;
}

async function storeAudioBlob({
  buffer,
  contentType,
  extension,
  flowId,
  trackId,
}: {
  buffer: Buffer;
  contentType: string;
  extension: string;
  flowId: string;
  trackId: string;
}) {
  const pathname = `echo/tracks/${flowId}/${trackId}${extension}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(pathname, buffer, {
      access: "private",
      allowOverwrite: false,
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return {
      storageProvider: "vercel_blob" as const,
      storageUrl: blob.url,
      storagePath: blob.pathname,
    };
  }

  if (process.env.VERCEL) {
    throw new FlowStoreError("Missing BLOB_READ_WRITE_TOKEN. Vercel needs Blob storage for audio uploads.", 500);
  }

  await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  const storagePath = path.join(LOCAL_UPLOAD_DIR, `${trackId}${extension}`);
  await fs.writeFile(storagePath, buffer);

  return {
    storageProvider: "local_file" as const,
    storagePath,
  };
}
