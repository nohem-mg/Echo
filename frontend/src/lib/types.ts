import type { IDKitResult } from "@worldcoin/idkit-core";

export type EchoFlowStatus = "world_verified" | "payment_requested" | "payment_confirmed" | "pipeline_started" | "error";

export type EchoFlow = {
  id: string;
  nullifierHash: string;
  trackName: string;
  trackFingerprint: string;
  worldMode: "world" | "mock";
  walletAddress?: `0x${string}`;
  paymentReference?: string;
  paymentAmountEth?: string;
  paymentChainId?: number;
  txHash?: `0x${string}`;
  status: EchoFlowStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorldVerification =
  | {
      status: "idle" | "pending";
      proof?: never;
      nullifier?: never;
      mode?: never;
      flow?: never;
    }
  | {
      status: "verified";
      proof: IDKitResult;
      nullifier: string;
      mode: "world" | "mock";
      flow: EchoFlow;
    }
  | {
      status: "error";
      error: string;
      proof?: never;
      nullifier?: never;
      mode?: never;
      flow?: never;
    };

export type EchoPayment =
  | {
      status: "idle" | "pending";
      reference?: string;
      hash?: `0x${string}`;
      mode?: never;
    }
  | {
      status: "paid";
      reference: string;
      hash: `0x${string}`;
      mode: "evm";
      blockNumber?: string;
    }
  | {
      status: "error";
      error: string;
      reference?: string;
      hash?: `0x${string}`;
      mode?: never;
    };

export type PaymentCreateResponse = {
  flowId: string;
  reference: string;
  receiver: `0x${string}`;
  amountEth: string;
  token: "ETH";
  description: string;
  chainId: 11155111;
  flow: EchoFlow;
};

export type PaymentConfirmRequest = {
  flowId: string;
  hash: `0x${string}`;
  reference: string;
  expectedFrom?: `0x${string}`;
};
