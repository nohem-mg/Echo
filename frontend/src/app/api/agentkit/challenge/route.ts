import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export type AgentkitChallenge = {
  domain: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
};

export async function GET(): Promise<Response> {
  const gatewayUrl = process.env.ECHO_GATEWAY_URL ?? "http://127.0.0.1:8080";
  const domain = new URL(gatewayUrl).hostname;

  const challenge: AgentkitChallenge = {
    domain,
    uri: `${gatewayUrl}/api/report`,
    version: "1",
    chainId: "eip155:4801",
    nonce: randomUUID().replace(/-/g, ""),
    issuedAt: new Date().toISOString(),
  };

  return NextResponse.json(challenge);
}
