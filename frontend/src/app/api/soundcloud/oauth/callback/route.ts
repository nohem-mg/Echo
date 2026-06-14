export const runtime = "nodejs";

const html = (script: string) =>
  new Response(`<!doctype html><html><body><script>${script}</script></body></html>`, {
    headers: { "Content-Type": "text/html" },
  });

const postMessage = (data: Record<string, unknown>) =>
  `window.opener?.postMessage(${JSON.stringify(data)},window.location.origin);window.close();`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return html(postMessage({ type: "soundcloud_auth_error", error: error ?? "No authorization code received" }));
  }

  const redirectUri = `${url.origin}/api/soundcloud/oauth/callback`;

  try {
    const tokenRes = await fetch("https://secure.soundcloud.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json; charset=utf-8",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.ECHO_SC_CLIENT_ID ?? "",
        client_secret: process.env.ECHO_SC_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return html(postMessage({ type: "soundcloud_auth_error", error: `Token exchange failed: ${errText}` }));
    }

    const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string };
    return html(
      postMessage({
        type: "soundcloud_auth_success",
        access_token: tokens.access_token ?? "",
        refresh_token: tokens.refresh_token ?? "",
      }),
    );
  } catch (err) {
    return html(postMessage({ type: "soundcloud_auth_error", error: String(err) }));
  }
}
