import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const clientId = process.env.ECHO_SC_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "ECHO_SC_CLIENT_ID not configured" }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/soundcloud/oauth/callback`;

  const authUrl = new URL("https://secure.soundcloud.com/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "non-expiring");

  return NextResponse.json({ auth_url: authUrl.toString(), redirect_uri: redirectUri });
}
