import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, parseEther, toHex } from "viem";
import { sepolia } from "viem/chains";
import type { PaymentConfirmRequest } from "@/lib/types";

const DEFAULT_RECEIVER = "0x0000000000000000000000000000000000000000";
const HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Partial<PaymentConfirmRequest>;
  const receiver = process.env.NEXT_PUBLIC_FEE_RECEIVER_ADDRESS ?? process.env.PAYMENT_RECEIVER_ADDRESS ?? "";
  const amountEth = process.env.NEXT_PUBLIC_FLOW_FEE_ETH ?? "0.001";

  if (!body.hash || !HASH_PATTERN.test(body.hash)) {
    return NextResponse.json({ error: "Missing or invalid transaction hash" }, { status: 400 });
  }

  if (!body.reference) {
    return NextResponse.json({ error: "Missing payment reference" }, { status: 400 });
  }

  if (!receiver || receiver === DEFAULT_RECEIVER || !isAddress(receiver)) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_FEE_RECEIVER_ADDRESS" }, { status: 500 });
  }

  const [transaction, receipt] = await Promise.all([
    publicClient.getTransaction({ hash: body.hash }),
    publicClient.getTransactionReceipt({ hash: body.hash }),
  ]);

  if (receipt.status !== "success") {
    return NextResponse.json({ error: "Transaction reverted", hash: body.hash }, { status: 400 });
  }

  if (transaction.to?.toLowerCase() !== receiver.toLowerCase()) {
    return NextResponse.json({ error: "Transaction receiver mismatch", hash: body.hash }, { status: 400 });
  }

  if (body.expectedFrom && transaction.from.toLowerCase() !== body.expectedFrom.toLowerCase()) {
    return NextResponse.json({ error: "Transaction sender mismatch", hash: body.hash }, { status: 400 });
  }

  if (transaction.value < parseEther(amountEth)) {
    return NextResponse.json({ error: "Transaction value is below the required fee", hash: body.hash }, { status: 400 });
  }

  if (transaction.input !== toHex(body.reference)) {
    return NextResponse.json({ error: "Payment reference mismatch", hash: body.hash }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    mode: "evm",
    transaction: {
      hash: body.hash,
      from: transaction.from,
      to: transaction.to,
      value: transaction.value.toString(),
      blockNumber: receipt.blockNumber.toString(),
      chainId: sepolia.id,
      reference: body.reference,
    },
  });
}
