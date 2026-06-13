import { NextResponse } from "next/server";
import type { PayResult } from "@worldcoin/minikit-js/commands";
import { mockWorldEnabled } from "@/lib/server-env";

type ConfirmBody = {
  payload?: PayResult | {
    transactionId?: string;
    reference?: string;
    from?: string;
    chain?: string;
    timestamp?: string;
  };
};

export async function POST(request: Request): Promise<Response> {
  const { payload } = (await request.json().catch(() => ({}))) as ConfirmBody;

  if (!payload?.transactionId || !payload.reference) {
    return NextResponse.json({ error: "Missing payment payload" }, { status: 400 });
  }

  const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID;
  const apiKey = process.env.WORLD_DEV_PORTAL_API_KEY;

  if (!appId || !apiKey) {
    if (!mockWorldEnabled()) {
      return NextResponse.json({ error: "Missing WORLD_DEV_PORTAL_API_KEY or app id" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      mode: "mock",
      transaction: {
        transactionId: payload.transactionId,
        reference: payload.reference,
        chain: payload.chain ?? "worldchain",
        status: "confirmed",
      },
    });
  }

  const response = await fetch(
    `https://developer.worldcoin.org/api/v2/minikit/transaction/${payload.transactionId}?app_id=${appId}&type=payment`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  const transaction = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json({ error: "Payment verification failed", details: transaction }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    mode: "world",
    transaction,
  });
}
