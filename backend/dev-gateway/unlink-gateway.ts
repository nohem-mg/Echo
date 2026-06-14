/**
 * Echo — Unlink backend auth routes.
 *
 * Non-custodial model: the ARTIST controls their own Unlink account in the browser
 * (`@unlink-xyz/sdk/browser`, derived from their wallet) and pays for their own
 * private on-chain registration. The artist's account is pre-funded for the demo.
 *
 * The gateway's ONLY Unlink responsibility is the two backend routes the browser SDK
 * delegates to — guarded by the tenant `apiKey` (a secret that must never reach the
 * client). It holds no user keys and signs nothing on the artist's behalf.
 *
 *   POST /api/unlink/register             → admin.users.register(payload)
 *   POST /api/unlink/authorization-token  → admin.authorizationTokens.issue(payload)
 *
 * The actual private registration (execute([registerTrack]), deposit, ownerKey) happens
 * CLIENT-SIDE in the frontend with the artist's account — not here.
 *
 * Unlink scope: on-chain account privacy only. NOT x402, NOT file/SoundCloud uploads,
 * NOT audio transit. SoundCloud publishing is the separate soundcloud-service.
 */

import { createUnlinkAdmin } from "@unlink-xyz/sdk/admin";

const UNLINK_API_KEY = process.env.UNLINK_API_KEY ?? "";
const UNLINK_ENV = "ethereum-sepolia"; // must match the Registry's chain

if (!UNLINK_API_KEY) {
  console.warn("[unlink] UNLINK_API_KEY not set — Unlink auth routes will not be wired.");
}

const admin = createUnlinkAdmin({
  environment: UNLINK_ENV,
  apiKey: UNLINK_API_KEY,
});

/**
 * Backend auth routes the browser SDK posts to.
 *
 * Privacy: do NOT log or persist any link between the artist's EOA and their Unlink
 * address. These handlers pass the payload straight to Unlink and return the result.
 */
export function getUnlinkRouteHandlers(): Record<
  string,
  (req: Request) => Promise<Response>
> {
  return {
    // Called by the browser SDK on first use (account registration).
    "/api/unlink/register": async (req: Request) => {
      const body = await req.json();
      const result = await admin.users.register(body);
      return Response.json(result);
    },

    // Browser SDK requests a short-lived authorization token.
    "/api/unlink/authorization-token": async (req: Request) => {
      const body = await req.json();
      const result = await admin.authorizationTokens.issue(body);
      return Response.json(result);
    },
  };
}
