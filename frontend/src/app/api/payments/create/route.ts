import { NextResponse } from "next/server";
import { mockWorldEnabled } from "@/lib/server-env";

const DEFAULT_RECEIVER = "0x0000000000000000000000000000000000000000";

export async function POST(): Promise<Response> {
  const receiver = process.env.PAYMENT_RECEIVER_ADDRESS ?? "";
  const amount = Number(process.env.NEXT_PUBLIC_PAYMENT_AMOUNT_WLD ?? "0.1");
  const description = process.env.NEXT_PUBLIC_PAYMENT_DESCRIPTION ?? "Echo prior-art seal";
  const isMock = mockWorldEnabled();

  if (!isMock && (!receiver || receiver === DEFAULT_RECEIVER)) {
    return NextResponse.json({ error: "Missing PAYMENT_RECEIVER_ADDRESS" }, { status: 500 });
  }

  return NextResponse.json({
    reference: `echo-${crypto.randomUUID()}`,
    to: isMock && !receiver ? DEFAULT_RECEIVER : receiver,
    amount,
    token: "WLD",
    description,
    mode: isMock ? "mock" : "world",
  });
}
