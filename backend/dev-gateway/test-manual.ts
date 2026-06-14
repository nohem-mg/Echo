import { createAgentkitClient, agentkitResourceServerExtension } from "@worldcoin/agentkit";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY = "0x6fabcc38e151f2d4c4cfd06da1963b250ed0b7e352ffb6789d7238939f0cb457";
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
