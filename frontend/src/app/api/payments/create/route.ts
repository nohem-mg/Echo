import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api-route";
import { isAddress } from "viem";
import { assignPaymentReference } from "@/lib/flow-store";

const DEFAULT_RECEIVER = "0x0000000000000000000000000000000000000000";
const SEPOLIA_CHAIN_ID = 11155111;

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const { flowId } = (await request.json().catch(() => ({}))) as { flowId?: string };
  const receiver = process.env.NEXT_PUBLIC_FEE_RECEIVER_ADDRESS ?? process.env.PAYMENT_RECEIVER_ADDRESS ?? "";
  const amountEth = process.env.NEXT_PUBLIC_FLOW_FEE_ETH ?? "0.001";
  const description = process.env.NEXT_PUBLIC_PAYMENT_DESCRIPTION ?? "Echo Sepolia prior-art fee";

  if (!flowId) {
    return NextResponse.json({ error: "Missing flowId" }, { status: 400 });
  }

  if (!receiver || receiver === DEFAULT_RECEIVER || !isAddress(receiver)) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_FEE_RECEIVER_ADDRESS" }, { status: 500 });
  }

  try {
    const flow = await assignPaymentReference({
      flowId,
      paymentReference: `echo-${crypto.randomUUID()}`,
      paymentAmountEth: amountEth,
      paymentChainId: SEPOLIA_CHAIN_ID,
    });

    if (!flow.paymentReference) {
      return NextResponse.json({ error: "Could not assign payment reference" }, { status: 500 });
    }

    return NextResponse.json({
      flowId: flow.id,
      reference: flow.paymentReference,
      receiver,
      amountEth,
      token: "ETH",
      description,
      chainId: SEPOLIA_CHAIN_ID,
      flow,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json({
    error: "Use POST with a verified flowId",
  }, { status: 405 });
}
