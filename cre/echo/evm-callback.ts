// ==========================================================================
// Echo — On-chain callback dispatch via EVMClient.writeReport
// --------------------------------------------------------------------------
// Sends the DON-signed CRE report to the Registry contract on Ethereum Sepolia.
// The MockKeystoneForwarder validates signatures then calls Registry.onReport().
// ==========================================================================

import { EVMClient, type Runtime } from "@chainlink/cre-sdk";
import type { Report } from "@chainlink/cre-sdk";

const SEPOLIA_CHAIN_SELECTOR =
  EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"];

const DEFAULT_WRITE_REPORT_GAS_LIMIT = "500000";

export function dispatchOnChainCallback<C>(
  runtime: Runtime<C>,
  registryAddress: string,
  report: Report,
  gasLimit = DEFAULT_WRITE_REPORT_GAS_LIMIT,
): string | undefined {
  const evm = new EVMClient(SEPOLIA_CHAIN_SELECTOR);
  const result = evm.writeReport(runtime, {
    receiver: registryAddress,
    report,
    gasConfig: { gasLimit },
  }).result() as unknown;
  const txHash = extractTxHash(result);
  runtime.log(
    `CRE → Registry.onReport dispatched (gas ${gasLimit}, ${registryAddress.slice(0, 10)}${txHash ? `, tx ${txHash.slice(0, 12)}…` : ""})`,
  );
  return txHash;
}

function extractTxHash(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["transactionHash", "txHash", "hash"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && /^0x[0-9a-fA-F]{64}$/.test(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
