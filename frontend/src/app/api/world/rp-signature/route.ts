import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { mockWorldEnabled } from "@/lib/server-env";

export async function POST(request: Request): Promise<Response> {
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  const signingKeyHex = process.env.WORLD_RP_SIGNING_KEY;

  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  if (!signingKeyHex) {
    if (!mockWorldEnabled()) {
      return NextResponse.json({ error: "Missing WORLD_RP_SIGNING_KEY" }, { status: 500 });
    }

    const now = Math.floor(Date.now() / 1000);
    return NextResponse.json({
      mode: "mock",
      sig: "0xmock_signature",
      nonce: crypto.randomUUID(),
      created_at: now,
      expires_at: now + 600,
    });
  }

  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex,
    action,
  });

  return NextResponse.json({
    mode: "world",
    sig,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
  });
}
