import type { IDKitResult } from "@worldcoin/idkit-core";

export type WorldVerification =
  | {
      status: "idle" | "pending";
      proof?: never;
      nullifier?: never;
      mode?: never;
    }
  | {
      status: "verified";
      proof: IDKitResult;
      nullifier: string;
      mode: "world" | "mock";
    }
  | {
      status: "error";
      error: string;
      proof?: never;
      nullifier?: never;
      mode?: never;
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
  reference: string;
  receiver: `0x${string}`;
  amountEth: string;
  token: "ETH";
  description: string;
  chainId: 11155111;
};

export type PaymentConfirmRequest = {
  hash: `0x${string}`;
  reference: string;
  expectedFrom?: `0x${string}`;
};
