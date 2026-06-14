import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * The /api/pipeline/seal endpoint is no longer needed.
 *
 * With the new one-pass Registry (onReport creates AND seals atomically),
 * the CRE pipeline writes on-chain directly after a CLEAN verdict.
 * There is no second "seal" trigger — the track is sealed inside the same
 * CRE execution that ran the DAG.
 *
 * Callers should update to use only /api/pipeline/start.
 */
export async function POST(): Promise<Response> {
  return NextResponse.json(
    {
      error: "This endpoint has been removed.",
      detail:
        "The Registry now seals tracks atomically in onReport() after a CLEAN verdict. " +
        "Use /api/pipeline/start instead — a single trigger runs the full DAG and seals on-chain.",
    },
    { status: 410 },
  );
}
