import { describe, expect, test } from "bun:test";
import { GET } from "./route";

// The error branch reflects the `error` query param into an inline <script>
// without touching the network — the right place to prove XSS is neutralized.
describe("soundcloud oauth callback — reflected error is not injectable", () => {
  test("a </script> breakout payload is escaped in the response body", async () => {
    const payload = "</script><script>alert(document.domain)</script>";
    const res = await GET(
      new Request(`https://echo.test/api/soundcloud/oauth/callback?error=${encodeURIComponent(payload)}`),
    );
    const body = await res.text();

    // The literal closing tag must never appear verbatim; only its escaped form.
    expect(body).not.toContain("</script><script>");
    expect(body).toContain("\\u003c");
    // Exactly one real <script> wrapper (the opener), one real closer.
    expect(body.match(/<script>/g)?.length).toBe(1);
    expect(body.match(/<\/script>/g)?.length).toBe(1);
  });

  test("line-separator payloads (U+2028) are escaped", async () => {
    const res = await GET(
      new Request(`https://echo.test/api/soundcloud/oauth/callback?error=a%E2%80%A8b`),
    );
    const body = await res.text();
    expect(body).toContain("\\u2028");
    expect(body).not.toContain(String.fromCharCode(0x2028));
  });
});
