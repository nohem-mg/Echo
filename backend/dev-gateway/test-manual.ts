import { createAgentkitClient, agentkitResourceServerExtension } from "@worldcoin/agentkit";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) throw new Error("Set PRIVATE_KEY (throwaway testnet key) before running this scratch harness.");
const account = privateKeyToAccount(PRIVATE_KEY);

const agentkit = createAgentkitClient({
  signer: {
    address: account.address,
    chainId: "eip155:10",
    type: "eip191",
    signMessage: async (message: string) => account.signMessage({ message }),
  },
});

async function runTest() {
  const extension = {
    ...agentkitResourceServerExtension,
    info: {},
    supportedChains: [{ chainId: "eip155:10", type: "eip191", signatureScheme: "eip191" }]
  };
  const header = await agentkit.createHeader(extension);
  console.log("Header:", header.substring(0, 50));
}
runTest();
