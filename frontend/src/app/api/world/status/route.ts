import { NextResponse } from "next/server";
import { mockWorldEnabled } from "@/lib/server-env";

const REQUIRED = [
  "NEXT_PUBLIC_WORLD_APP_ID",
  "NEXT_PUBLIC_WORLD_RP_ID",
  "WORLD_RP_SIGNING_KEY",
] as const;

const OPTIONAL = ["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "SEPOLIA_RPC_URL"] as const;

export async function GET(): Promise<Response> {
  const feeReceiver = process.env.NEXT_PUBLIC_FEE_RECEIVER_ADDRESS ?? process.env.PAYMENT_RECEIVER_ADDRESS;
  const missing = [...REQUIRED.filter((name) => !process.env[name]), ...(feeReceiver ? [] : ["NEXT_PUBLIC_FEE_RECEIVER_ADDRESS"])];
  const missingOptional = OPTIONAL.filter((name) => !process.env[name]);

  return NextResponse.json({
    ready: missing.length === 0,
    mockWorldEnabled: mockWorldEnabled(),
    missing,
    missingOptional,
    environment: process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT ?? "staging",
    chainId: Number(process.env.NEXT_PUBLIC_REGISTRY_CHAIN_ID ?? "11155111"),
    feeEth: process.env.NEXT_PUBLIC_FLOW_FEE_ETH ?? "0.001",
  });
}
