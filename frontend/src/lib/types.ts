import type { IDKitResult } from "@worldcoin/idkit-core";
import type { PayResult } from "@worldcoin/minikit-js/commands";

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
      transactionId?: never;
      mode?: never;
    }
  | {
      status: "paid";
      reference: string;
      transactionId: string;
      mode: "world" | "mock";
    }
  | {
      status: "error";
      error: string;
      reference?: string;
      transactionId?: never;
      mode?: never;
    };

export type PaymentCreateResponse = {
  reference: string;
  to: `0x${string}`;
  amount: number;
  token: "WLD";
  description: string;
  mode: "world" | "mock";
};

export type PaymentConfirmRequest = {
  payload: PayResult | {
    transactionId: string;
    reference: string;
    from?: string;
    chain?: string;
    timestamp?: string;
  };
};
