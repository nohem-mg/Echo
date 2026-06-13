// ==========================================================================
// Echo — On-chain callback dispatch via EVMClient.writeReport
// --------------------------------------------------------------------------
// Sends the DON-signed CRE report to the Registry contract on Base Sepolia.
// The Chainlink forwarder on-chain calls receiveCRECallback() on the Registry.
//
// Blocked on: Registry contract address (Cyriac, Base Sepolia deploy).
// REGISTRY_ADDRESS placeholder — swap in config once Cyriac deploys.
// ==========================================================================

import { EVMClient, hexToBase64, type Runtime } from "@chainlink/cre-sdk";
import type { Report } from "@chainlink/cre-sdk";

// Base Sepolia (ethereum-testnet-sepolia-base-1).
const BASE_SEPOLIA_CHAIN_SELECTOR =
  EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia-base-1"];

/**
 * Dispatches the DON-signed report to the Registry contract.
 * Called for all non-ERROR verdicts (CLEAN / SIMILAR / REJECTED).
 *
 * Blocked on:
 *   registryAddress — Cyriac's deployed Registry on Base Sepolia.
 *   ABI — Cyriac must confirm receiveCRECallback(string, bytes32, bytes) types.
 */
export function dispatchOnChainCallback<C>(
  runtime: Runtime<C>,
  registryAddress: string,
  report: Report,
): void {
  const evm = new EVMClient(BASE_SEPOLIA_CHAIN_SELECTOR);
  // receiver must be the 20-byte address in base64 (protobuf JSON bytes format).
  evm.writeReport(runtime, {
    receiver: hexToBase64(registryAddress),
    report,
  }).result();
  runtime.log(
    `CRE → Registry.receiveCRECallback dispatched (${registryAddress.slice(0, 10)}…)`,
  );
}
