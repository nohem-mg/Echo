import { NextResponse } from "next/server";
import { mockWorldEnabled } from "@/lib/server-env";

const REQUIRED = [
  "NEXT_PUBLIC_WORLD_APP_ID",
  "NEXT_PUBLIC_WORLD_RP_ID",
  "WORLD_RP_SIGNING_KEY",
  "WORLD_DEV_PORTAL_API_KEY",
  "PAYMENT_RECEIVER_ADDRESS",
] as const;

export async function GET(): Promise<Response> {
  const missing = REQUIRED.filter((name) => !process.env[name]);

  return NextResponse.json({
    ready: missing.length === 0,
    mockWorldEnabled: mockWorldEnabled(),
    missing,
    environment: process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT ?? "staging",
    paymentAmountWld: process.env.NEXT_PUBLIC_PAYMENT_AMOUNT_WLD ?? "0.1",
  });
}
