import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api-route";
import type { IDKitResult } from "@worldcoin/idkit-core";
import { createOrReuseFlow } from "@/lib/flow-store";
import { mockWorldEnabled } from "@/lib/server-env";

type VerifyRequest = {
  rp_id?: string;
  idkitResponse?: IDKitResult;
  track?: {
    name?: string;
    fingerprint?: string;
  };
};

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const { rp_id, idkitResponse, track } = (await request.json().catch(() => ({}))) as VerifyRequest;

  if (!rp_id || !idkitResponse) {
    return NextResponse.json({ error: "Missing rp_id or idkitResponse" }, { status: 400 });
  }

  if (mockWorldEnabled() && "nonce" in idkitResponse && idkitResponse.nonce.startsWith("mock-")) {
    const nullifier = getNullifier(idkitResponse);
    const flow = await createFlowOrResponse({
      nullifier,
      trackName: track?.name,
      trackFingerprint: track?.fingerprint,
      mode: "mock",
    });

    if (flow instanceof Response) {
      return flow;
    }

    return NextResponse.json({
      success: true,
      mode: "mock",
      nullifier,
      flow,
    });
  }

  const response = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(idkitResponse),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return NextResponse.json({ error: "Verification failed", details: body }, { status: 400 });
  }

  const nullifier = getNullifier(idkitResponse);
  const flow = await createFlowOrResponse({
    nullifier,
    trackName: track?.name,
    trackFingerprint: track?.fingerprint,
    mode: "world",
  });

  if (flow instanceof Response) {
    return flow;
  }

  return NextResponse.json({
    success: true,
    mode: "world",
    nullifier,
    flow,
  });
}

function getNullifier(result: IDKitResult) {
  const firstResponse = result.responses[0];

  if (!firstResponse) {
    return "";
  }

  if ("nullifier" in firstResponse) {
    return firstResponse.nullifier;
  }

  if ("session_nullifier" in firstResponse) {
    return firstResponse.session_nullifier[0] ?? "";
  }

  return "";
}

async function createFlowOrResponse({
  nullifier,
  trackName,
  trackFingerprint,
  mode,
}: {
  nullifier: string;
  trackName?: string;
  trackFingerprint?: string;
  mode: "world" | "mock";
}) {
  if (!trackName || !trackFingerprint) {
    return undefined;
  }

  try {
    return await createOrReuseFlow({
      nullifierHash: nullifier,
      trackName,
      trackFingerprint,
      worldMode: mode,
    });
  } catch (error) {
    return handleRouteError(error, { message: "Flow persistence failed", log: true });
  }
}
