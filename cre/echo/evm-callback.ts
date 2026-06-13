// ==========================================================================
// Echo — On-chain callback dispatch via EVMClient.writeReport
// --------------------------------------------------------------------------
// Sends the DON-signed CRE report to the Registry contract on Ethereum Sepolia.
// The MockKeystoneForwarder validates signatures then calls Registry.onReport().
// ==========================================================================

import {
  EVMClient,
  HTTPClient,
  consensusIdenticalAggregation,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk";
import type { Report } from "@chainlink/cre-sdk";

const SEPOLIA_CHAIN_SELECTOR =
  EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"];

const DEFAULT_WRITE_REPORT_GAS_LIMIT = "500000";
const DEFAULT_SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const DEFAULT_KEYSTONE_FORWARDER = "0x15fc6ae953e024d975e77382eeec56a9101f9f88";

const TX_HASH_KEYS = ["txHash", "tx_hash", "transactionHash", "transaction_hash", "hash"] as const;

export type DispatchOnChainOptions = {
  gasLimit?: string;
  sepoliaRpcUrl?: string;
  keystoneForwarderAddress?: string;
  creWalletAddress?: string;
};

export function dispatchOnChainCallback<C>(
  runtime: Runtime<C>,
  registryAddress: string,
  report: Report,
  options: DispatchOnChainOptions = {},
): string | undefined {
  const gasLimit = options.gasLimit ?? DEFAULT_WRITE_REPORT_GAS_LIMIT;
  const rpcUrl = options.sepoliaRpcUrl ?? DEFAULT_SEPOLIA_RPC;
  const forwarderAddress = options.keystoneForwarderAddress ?? DEFAULT_KEYSTONE_FORWARDER;
  const startBlock = readLatestBlockNumber(runtime, rpcUrl);

  const evm = new EVMClient(SEPOLIA_CHAIN_SELECTOR);
  const result = evm.writeReport(runtime, {
    receiver: registryAddress,
    report,
    gasConfig: { gasLimit },
  }).result() as unknown;

  let txHash = extractTxHash(result);
  if (!txHash) {
    txHash = resolveForwarderTxHash(runtime, {
      rpcUrl,
      forwarderAddress,
      creWalletAddress: options.creWalletAddress,
      startBlock,
    });
    if (txHash) {
      runtime.log(`CRE writeReport: tx hash resolved via Sepolia RPC (${txHash.slice(0, 12)}…)`);
    }
  }

  runtime.log(
    `CRE → Registry.onReport dispatched (gas ${gasLimit}, ${registryAddress.slice(0, 10)}${txHash ? `, tx ${txHash.slice(0, 12)}…` : ""})`,
  );
  return txHash;
}

/** WriteReportReply exposes tx_hash as bytes — normalize to a 0x-prefixed hex string. */
export function extractTxHash(value: unknown, depth = 0): string | undefined {
  if (depth > 8) {
    return undefined;
  }

  const direct = normalizeTxHash(value);
  if (direct) {
    return direct;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of TX_HASH_KEYS) {
    const candidate = normalizeTxHash(record[key]);
    if (candidate) {
      return candidate;
    }
  }

  for (const entry of Object.values(record)) {
    const nested = extractTxHash(entry, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

type RpcBlock = {
  transactions: Array<{ hash?: string; to?: string; from?: string }>;
};

/** Pick the latest matching tx to the Keystone forwarder inside scanned blocks. */
export function pickForwarderTransactionHash(
  blocks: RpcBlock[],
  forwarderAddress: string,
  senderAddress?: string,
): string | undefined {
  const forwarder = forwarderAddress.toLowerCase();
  const sender = senderAddress?.toLowerCase();

  for (let blockIndex = blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
    const transactions = blocks[blockIndex]?.transactions ?? [];
    for (let txIndex = transactions.length - 1; txIndex >= 0; txIndex -= 1) {
      const tx = transactions[txIndex];
      if (tx.to?.toLowerCase() !== forwarder) {
        continue;
      }
      if (sender && tx.from?.toLowerCase() !== sender) {
        continue;
      }
      const hash = normalizeTxHash(tx.hash);
      if (hash) {
        return hash;
      }
    }
  }

  return undefined;
}

function resolveForwarderTxHash<C>(
  runtime: Runtime<C>,
  args: {
    rpcUrl: string;
    forwarderAddress: string;
    creWalletAddress?: string;
    startBlock?: number;
  },
): string | undefined {
  const scanInNode = (nodeRuntime: NodeRuntime<C>): string => {
    const http = new HTTPClient();
    const latest = readBlockNumber(http, nodeRuntime, args.rpcUrl);
    const fromBlock = args.startBlock ?? Math.max(0, latest - 3);
    const blocks: RpcBlock[] = [];

    for (let blockNumber = fromBlock; blockNumber <= latest; blockNumber += 1) {
      const block = readBlock(http, nodeRuntime, args.rpcUrl, blockNumber);
      if (block) {
        blocks.push(block);
      }
    }

    return pickForwarderTransactionHash(blocks, args.forwarderAddress, args.creWalletAddress) ?? "";
  };

  const handle = runtime.runInNodeMode(scanInNode, consensusIdenticalAggregation<string>())();
  const hash = handle.result();
  return hash || undefined;
}

function readLatestBlockNumber<C>(runtime: Runtime<C>, rpcUrl: string): number | undefined {
  const readInNode = (nodeRuntime: NodeRuntime<C>): string => {
    const http = new HTTPClient();
    const blockNumber = readBlockNumber(http, nodeRuntime, rpcUrl);
    return String(blockNumber);
  };

  try {
    const handle = runtime.runInNodeMode(readInNode, consensusIdenticalAggregation<string>())();
    const parsed = Number(handle.result());
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readBlockNumber(http: HTTPClient, nodeRuntime: NodeRuntime<unknown>, rpcUrl: string): number {
  const result = jsonRpc(http, nodeRuntime, rpcUrl, "eth_blockNumber", []);
  return parseBlockNumber(result);
}

function readBlock(
  http: HTTPClient,
  nodeRuntime: NodeRuntime<unknown>,
  rpcUrl: string,
  blockNumber: number,
): RpcBlock | undefined {
  const result = jsonRpc(http, nodeRuntime, rpcUrl, "eth_getBlockByNumber", [
    `0x${blockNumber.toString(16)}`,
    true,
  ]);
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const transactions = (result as { transactions?: unknown }).transactions;
  if (!Array.isArray(transactions)) {
    return undefined;
  }

  return {
    transactions: transactions.filter((entry): entry is { hash?: string; to?: string; from?: string } => {
      return Boolean(entry) && typeof entry === "object";
    }),
  };
}

function jsonRpc(
  http: HTTPClient,
  nodeRuntime: NodeRuntime<unknown>,
  rpcUrl: string,
  method: string,
  params: unknown[],
): unknown {
  const response = http
    .sendRequest(nodeRuntime, {
      url: rpcUrl,
      method: "POST",
      body: new TextEncoder().encode(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })),
      headers: { "content-type": "application/json" },
      timeout: "10s",
    })
    .result();

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Sepolia RPC ${method} -> HTTP ${response.statusCode}`);
  }

  const payload = JSON.parse(new TextDecoder().decode(response.body)) as { result?: unknown; error?: { message?: string } };
  if (payload.error) {
    throw new Error(`Sepolia RPC ${method} -> ${payload.error.message ?? "RPC error"}`);
  }

  return payload.result;
}

function parseBlockNumber(value: unknown): number {
  if (typeof value === "string" && value.startsWith("0x")) {
    return Number.parseInt(value.slice(2), 16);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function normalizeTxHash(value: unknown): string | undefined {
  if (typeof value === "string") {
    if (/^0x[0-9a-fA-F]{64}$/.test(value)) {
      return value;
    }
    if (/^[0-9a-fA-F]{64}$/.test(value)) {
      return `0x${value}`;
    }
    return undefined;
  }

  if (value instanceof Uint8Array) {
    return bytesToTxHash(value);
  }

  if (
    Array.isArray(value) &&
    value.length === 32 &&
    value.every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= 255)
  ) {
    return bytesToTxHash(Uint8Array.from(value));
  }

  return undefined;
}

function bytesToTxHash(bytes: Uint8Array): string | undefined {
  if (bytes.length !== 32) {
    return undefined;
  }

  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `0x${hex}`;
}
