"use client";

import { useCallback, useRef, useState } from "react";
import { encodeFunctionData, parseUnits, type Abi } from "viem";
import escrowAbiJson from "@/lib/abi/LicenseEscrow.json";
import { echoConfig } from "@/lib/config";

const escrowAbi = escrowAbiJson.abi as Abi;

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;

type UnlinkClient = import("@unlink-xyz/sdk/browser").UnlinkClient;

type EscrowState =
  | { status: "idle" }
  | { status: "pending"; action: string }
  | { status: "success"; txHash: string | null; executionId: string }
  | { status: "error"; error: string };

type DepositState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; error: string };

// Statuses that mean the UserOp was submitted but the inner call reverted.
const REVERTED_STATUSES = new Set(["user_op_reverted", "failed", "manual_recovery_required"]);

async function runExecute(
  client: UnlinkClient,
  params: Parameters<UnlinkClient["execute"]>[0],
): Promise<{ executionId: string; txHash: string | null }> {
  const result = await client.execute(params);
  if (REVERTED_STATUSES.has(result.status)) {
    const txPart = result.handleOpsTxHash ? ` — tx: ${result.handleOpsTxHash}` : "";
    throw new Error(`Revert on-chain (${result.status})${txPart}`);
  }
  return { executionId: result.executionId, txHash: result.handleOpsTxHash };
}

export function useUnlinkEscrow() {
  const clientRef = useRef<UnlinkClient | null>(null);
  const [state, setState] = useState<EscrowState>({ status: "idle" });
  const [depositState, setDepositState] = useState<DepositState>({ status: "idle" });

  const getClient = useCallback(async (): Promise<UnlinkClient> => {
    if (clientRef.current) return clientRef.current;

    const { account, evm, createUnlinkClient } = await import("@unlink-xyz/sdk/browser");

    const { account: unlinkAccount } = await account.fromMetaMask({
      provider: window.ethereum as Parameters<typeof account.fromMetaMask>[0]["provider"],
      appId: "echo",
      chainId: 11155111,
      registerUrl: "/api/unlink/register",
    });

    const client = createUnlinkClient({
      environment: "ethereum-sepolia",
      account: unlinkAccount,
      registerUrl: "/api/unlink/register",
      authorizationToken: { url: "/api/unlink/authorization-token" },
      evm: evm.fromEip1193({ provider: window.ethereum as Parameters<typeof evm.fromEip1193>[0]["provider"] }),
    });

    clientRef.current = client;
    return client;
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);
  const resetDeposit = useCallback(() => setDepositState({ status: "idle" }), []);

  const deposit = useCallback(
    async (amount: string) => {
      setDepositState({ status: "pending" });
      try {
        const client = await getClient();
        const amountWei = parseUnits(amount, 18).toString();
        const handle = await client.depositWithApproval({
          token: echoConfig.unlinkTokenAddress,
          amount: amountWei,
        });
        await handle.wait();
        setDepositState({ status: "success" });
      } catch (err) {
        const msg = err instanceof Error ? err.message.split("\n")[0]?.slice(0, 160) : "Deposit failed";
        setDepositState({ status: "error", error: msg });
        throw err;
      }
    },
    [getClient],
  );

  const createListing = useCallback(
    async (trackId: `0x${string}`, price: bigint, licenseType: number, duration: number) => {
      setState({ status: "pending", action: "createListing" });
      try {
        const client = await getClient();
        const data = encodeFunctionData({
          abi: escrowAbi,
          functionName: "createListing",
          args: [trackId, price, licenseType, duration],
        });
        const { executionId, txHash } = await runExecute(client, {
          token: echoConfig.unlinkTokenAddress,
          amount: "1",
          calls: [{ target: echoConfig.escrowAddress, value: "0", data }],
        });
        setState({ status: "success", executionId, txHash });
      } catch (err) {
        const msg = err instanceof Error ? err.message.split("\n")[0]?.slice(0, 160) : "createListing failed";
        setState({ status: "error", error: msg });
        throw err;
      }
    },
    [getClient],
  );

  const purchase = useCallback(
    async (listingId: `0x${string}`, price: bigint) => {
      setState({ status: "pending", action: "purchase" });
      try {
        const client = await getClient();
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [echoConfig.escrowAddress as `0x${string}`, price],
        });
        const purchaseData = encodeFunctionData({
          abi: escrowAbi,
          functionName: "purchase",
          args: [listingId],
        });
        const { executionId, txHash } = await runExecute(client, {
          token: echoConfig.unlinkTokenAddress,
          amount: price.toString(),
          calls: [
            { target: echoConfig.unlinkTokenAddress, value: "0", data: approveData },
            { target: echoConfig.escrowAddress, value: "0", data: purchaseData },
          ],
        });
        setState({ status: "success", executionId, txHash });
      } catch (err) {
        const msg = err instanceof Error ? err.message.split("\n")[0]?.slice(0, 160) : "purchase failed";
        setState({ status: "error", error: msg });
        throw err;
      }
    },
    [getClient],
  );

  const confirmAndRelease = useCallback(
    async (listingId: `0x${string}`) => {
      setState({ status: "pending", action: "confirmAndRelease" });
      try {
        const client = await getClient();
        const data = encodeFunctionData({
          abi: escrowAbi,
          functionName: "confirmAndRelease",
          args: [listingId],
        });
        const { executionId, txHash } = await runExecute(client, {
          token: echoConfig.unlinkTokenAddress,
          amount: "1",
          calls: [{ target: echoConfig.escrowAddress, value: "0", data }],
        });
        setState({ status: "success", executionId, txHash });
      } catch (err) {
        const msg = err instanceof Error ? err.message.split("\n")[0]?.slice(0, 160) : "confirmAndRelease failed";
        setState({ status: "error", error: msg });
        throw err;
      }
    },
    [getClient],
  );

  const cancel = useCallback(
    async (listingId: `0x${string}`) => {
      setState({ status: "pending", action: "cancel" });
      try {
        const client = await getClient();
        const data = encodeFunctionData({
          abi: escrowAbi,
          functionName: "cancel",
          args: [listingId],
        });
        const { executionId, txHash } = await runExecute(client, {
          token: echoConfig.unlinkTokenAddress,
          amount: "1",
          calls: [{ target: echoConfig.escrowAddress, value: "0", data }],
        });
        setState({ status: "success", executionId, txHash });
      } catch (err) {
        const msg = err instanceof Error ? err.message.split("\n")[0]?.slice(0, 160) : "cancel failed";
        setState({ status: "error", error: msg });
        throw err;
      }
    },
    [getClient],
  );

  const txHash = state.status === "success" ? state.txHash : null;

  return {
    state,
    reset,
    createListing,
    purchase,
    confirmAndRelease,
    cancel,
    isPending: state.status === "pending",
    isSuccess: state.status === "success",
    error: state.status === "error" ? state.error : null,
    txHash,
    // deposit helpers
    deposit,
    depositState,
    resetDeposit,
    isDepositing: depositState.status === "pending",
    isDepositSuccess: depositState.status === "success",
    depositError: depositState.status === "error" ? depositState.error : null,
  };
}
