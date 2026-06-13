import { NextResponse } from "next/server";
import { isAddress } from "viem";

const DEFAULT_RECEIVER = "0x0000000000000000000000000000000000000000";
const SEPOLIA_CHAIN_ID = 11155111;

export async function POST(): Promise<Response> {
  const receiver = process.env.NEXT_PUBLIC_FEE_RECEIVER_ADDRESS ?? process.env.PAYMENT_RECEIVER_ADDRESS ?? "";
  const amountEth = process.env.NEXT_PUBLIC_FLOW_FEE_ETH ?? "0.001";
  const description = process.env.NEXT_PUBLIC_PAYMENT_DESCRIPTION ?? "Echo Sepolia prior-art fee";

  if (!receiver || receiver === DEFAULT_RECEIVER || !isAddress(receiver)) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_FEE_RECEIVER_ADDRESS" }, { status: 500 });
  }

  return NextResponse.json({
    reference: `echo-${crypto.randomUUID()}`,
    receiver,
    amountEth,
    token: "ETH",
    description,
    chainId: SEPOLIA_CHAIN_ID,
  });
}
