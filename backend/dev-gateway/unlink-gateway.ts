/**
 * Echo — Unlink SDK bootstrap module.
 *
 * Initialises the Echo Protocol's custodial Unlink client (server-side pattern:
 * the gateway holds the service account key, not the artist). This module:
 *
 *   1. Registers the Echo Protocol service account on startup (idempotent).
 *   2. Exports `unlinkClient` so Jean can use it to route x402 inter-agent
 *      payments (Steps 2A, 2B, 3, 4) without any additional setup.
 *   3. Provides `registerUnlinkRoutes()` to wire the two auth routes that the
 *      browser SDK expects when an artist's frontend uses Unlink.
 *
 * NOTE: Unlink is NOT involved in the SoundCloud upload path. SoundCloud has
 * no upload fee. The gateway proxies the upload directly to soundcloud-service.
 */

import { createUnlinkAdmin, toRegistrationPayload } from "@unlink-xyz/sdk/admin";
// /client = custodial server pattern (gateway holds the key, not the user).
// /browser would be for non-custodial frontend apps.
import { account, createUnlinkClient } from "@unlink-xyz/sdk/client";

const UNLINK_API_KEY = process.env.UNLINK_API_KEY ?? "";
const UNLINK_MNEMONIC = process.env.UNLINK_MNEMONIC ?? "";
const UNLINK_ENV = "ethereum-sepolia";

if (!UNLINK_API_KEY || !UNLINK_MNEMONIC) {
  console.warn(
    "[unlink] UNLINK_API_KEY or UNLINK_MNEMONIC not set — " +
      "Unlink client will not be functional. " +
      "Set both env vars to enable x402 inter-agent payments."
  );
}

const admin = createUnlinkAdmin({
  environment: UNLINK_ENV,
  apiKey: UNLINK_API_KEY,
});

const unlinkAccount = account.fromMnemonic({ mnemonic: UNLINK_MNEMONIC });

/**
 * Echo Protocol service-level Unlink client.
 * Exported for Jean to attach x402 payment logic for pipeline Steps 2A/2B/3/4.
 */
export const unlinkClient = createUnlinkClient({
  environment: UNLINK_ENV,
  account: unlinkAccount,
  register: (payload) => admin.users.register(payload),
  authorizationToken: {
    provider: async () => {
      const addr = await unlinkAccount.getAddress();
      return admin.authorizationTokens.issue({ unlinkAddress: addr });
    },
  },
});

// Register the Echo Protocol service account once at startup.
// Catch errors silently — already registered is not a failure.
try {
  const payload = await toRegistrationPayload(unlinkAccount);
  await admin.users.register(payload);
  console.log(`[unlink] service account registered: ${payload.address}`);
} catch {
  // Already registered — ignore.
}

/**
 * Wire the two Unlink backend auth routes that the browser SDK expects.
 *
 * These routes are needed if the frontend (Cyriac) uses the Unlink browser
 * SDK to let artists manage their own private Unlink balances. They are NOT
 * required for the SoundCloud upload flow.
 *
 * Call this once during gateway startup, passing the Bun.serve fetch handler
 * context or an equivalent router.
 */
export function getUnlinkRouteHandlers(): Record<
  string,
  (req: Request) => Promise<Response>
> {
  return {
    // POST /api/unlink/register — called by the browser SDK on first use.
    "/api/unlink/register": async (req: Request) => {
      const body = await req.json();
      const result = await admin.users.register(body);
      return Response.json(result);
    },

    // POST /api/unlink/authorization-token — browser SDK requests a short-lived token.
    "/api/unlink/authorization-token": async (req: Request) => {
      const body = await req.json();
      const result = await admin.authorizationTokens.issue(body);
      return Response.json(result);
    },
  };
}
