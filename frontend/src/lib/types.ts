import type { IDKitResult } from "@worldcoin/idkit-core";

export type EchoFlowStatus =
  | "world_verified"
  | "payment_requested"
  | "payment_confirmed"
  | "track_uploaded"
  | "pipeline_started"
  | "pipeline_completed"
  | "pipeline_blocked"
  | "error";

export type EchoTrack = {
  id: string;
  flowId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  fingerprint: string;
  storageProvider: "local_file" | "vercel_blob";
  storageUrl?: string;
  storagePath?: string;
  createdAt: string;
  updatedAt: string;
};

export type EchoPipelineStatus = "queued" | "running" | "done" | "blocked" | "error";

export type EchoPipelineStep = {
  id: string;
  flowId: string;
  trackId: string;
  stepKey: string;
  label: string;
  detail: string;
  phase: "sequential" | "parallel";
  position: number;
  status: EchoPipelineStatus;
  progress: number;
  meta?: string;
  reason?: string;
  createdAt: string;
  updatedAt: string;
};

export type EchoSimilarTrack = {
  rank: number;
  title: string;
  source: string;
  score: number;
  /** undefined = data not available for this analysis step */
  melody?: number;
  rhythm?: number;
  structure?: number;
  key: string;
  BPM?: number;
  /** MIDI sub-scores from Step 2B (registry matches only) */
  global_overlap?: number;
  hook?: number;
  hook_intervals?: number;
};

export type EchoReport = {
  verdict: "CLEAN" | "SIMILAR" | "REJECTED";
  submitted_track?: {
    key?: string;
    mode?: string;
    BPM?: number;
    fingerprint?: string;
  };
  similar_tracks: EchoSimilarTrack[];
  ai_summary?: string;
};

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
  commitmentHash?: `0x${string}`;
  registryRef?: `0x${string}`;
  registryTrackId?: `0x${string}`;
  registryTxHash?: `0x${string}`;
  report?: EchoReport;
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

export type TrackUploadResponse = {
  flow: EchoFlow;
  track: EchoTrack;
  pipeline: EchoPipelineStep[];
  analysis: {
    status: "queued";
    entrypoint: "/api/pipeline/start";
  };
};
