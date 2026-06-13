// ==========================================================================
// Echo — On-chain callback dispatch via EVMClient.writeReport
// --------------------------------------------------------------------------
// Sends the DON-signed CRE report to the Registry contract on Ethereum Sepolia.
// The Chainlink forwarder on-chain calls receiveCRECallback() on the Registry.
//
// Blocked on: Registry contract address (Cyriac, Ethereum Sepolia deploy).
// REGISTRY_ADDRESS placeholder — swap in config once Cyriac deploys.
// ==========================================================================

import { EVMClient, type Runtime } from "@chainlink/cre-sdk";
import type { Report } from "@chainlink/cre-sdk";

// Registry is deployed on Ethereum Sepolia (sepolia.etherscan.io).
const SEPOLIA_CHAIN_SELECTOR =
  EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"];

/**
 * Dispatches the DON-signed report to the Registry contract.
 * Called for all non-ERROR verdicts (CLEAN / SIMILAR / REJECTED).
 *
 * Blocked on:
 *   registryAddress — Cyriac's deployed Registry on Ethereum Sepolia.
 *   ABI — Cyriac must confirm receiveCRECallback(string, bytes32, bytes) types.
 */
export function dispatchOnChainCallback<C>(
  runtime: Runtime<C>,
  registryAddress: string,
  report: Report,
): void {
  const evm = new EVMClient(SEPOLIA_CHAIN_SELECTOR);
  evm.writeReport(runtime, {
    receiver: registryAddress,
    report,
  }).result();
  runtime.log(
    `CRE → Registry.receiveCRECallback dispatched (${registryAddress.slice(0, 10)}…)`,
  );
}
