import { NextResponse } from "next/server";
import type { IDKitResult } from "@worldcoin/idkit-core";
import { mockWorldEnabled } from "@/lib/server-env";

type VerifyRequest = {
  rp_id?: string;
  idkitResponse?: IDKitResult;
};

export async function POST(request: Request): Promise<Response> {
  const { rp_id, idkitResponse } = (await request.json().catch(() => ({}))) as VerifyRequest;

  if (!rp_id || !idkitResponse) {
    return NextResponse.json({ error: "Missing rp_id or idkitResponse" }, { status: 400 });
  }

  if (mockWorldEnabled() && "nonce" in idkitResponse && idkitResponse.nonce.startsWith("mock-")) {
    return NextResponse.json({
      success: true,
      mode: "mock",
      nullifier: getNullifier(idkitResponse),
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

  return NextResponse.json({
    success: true,
    mode: "world",
    nullifier: getNullifier(idkitResponse),
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
