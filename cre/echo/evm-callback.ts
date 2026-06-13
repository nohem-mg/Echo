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
): void {
  const evm = new EVMClient(SEPOLIA_CHAIN_SELECTOR);
  evm.writeReport(runtime, {
    receiver: registryAddress,
    report,
    gasConfig: { gasLimit },
  }).result();
  runtime.log(
    `CRE → Registry.onReport dispatched (gas ${gasLimit}, ${registryAddress.slice(0, 10)}…)`,
  );
}
