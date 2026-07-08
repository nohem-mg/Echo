type AgentkitChallenge = {
  domain: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
};

export async function buildAgentkitHeader(
  address: string,
  signMsg: (message: string) => Promise<string>,
): Promise<string | undefined> {
  try {
    const challenge = (await fetch("/api/agentkit/challenge").then((r) => r.json())) as AgentkitChallenge;
    const chainIdNumeric = Number(challenge.chainId.split(":")[1]);

    // SIWE message format (agentkit-core formatSIWEMessage — eip191, no statement)
    const message = [
      `${challenge.domain} wants you to sign in with your Ethereum account:`,
      address,
      "",
      `URI: ${challenge.uri}`,
      `Version: ${challenge.version}`,
      `Chain ID: ${chainIdNumeric}`,
      `Nonce: ${challenge.nonce}`,
      `Issued At: ${challenge.issuedAt}`,
    ].join("\n");

    const signature = await signMsg(message);

    const payload = {
      domain: challenge.domain,
      address,
      uri: challenge.uri,
      version: challenge.version,
      chainId: challenge.chainId,
      type: "eip191",
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt,
      signature,
    };

    // Standard base64 as expected by agentkit-core parseAgentkitHeader
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
    return btoa(binary);
  } catch (err) {
    console.warn("[Echo] AgentKit signing skipped:", err);
    return undefined;
  }
}
