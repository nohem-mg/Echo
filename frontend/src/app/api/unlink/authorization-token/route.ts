import { NextResponse } from "next/server";

const UNLINK_API_KEY = process.env.UNLINK_API_KEY ?? "";
const UNLINK_ENV = "ethereum-sepolia";

export async function POST(req: Request) {
  if (!UNLINK_API_KEY) {
    return NextResponse.json({ error: "UNLINK_API_KEY not configured" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { createUnlinkAdmin } = await import("@unlink-xyz/sdk/admin");
    const admin = createUnlinkAdmin({ environment: UNLINK_ENV, apiKey: UNLINK_API_KEY });
    const result = await admin.authorizationTokens.issue(body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token issuance failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
