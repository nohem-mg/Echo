import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api-route";
import {
  blockPipeline,
  completePipeline,
  getFlow,
  getPipelineSteps,
  getTrackForFlow,
  updatePipelineOutcome,
  updatePipelineStep,
} from "@/lib/flow-store";
import type { EchoFlowStatus, EchoPipelineStatus, EchoReport } from "@/lib/types";
import {
  deriveOwnerKey,
  isTrackRegisteredOnChain,
  parseTrackSealedTrackId,
} from "@/lib/registry-handoff";
import { createPublicClient, http, keccak256 } from "viem";
import { sepolia } from "viem/chains";

type PipelineEventRequest = {
  flowId?: string;
  stepKey?: string;
  status?: EchoPipelineStatus;
  flowStatus?: Extract<EchoFlowStatus, "pipeline_completed" | "pipeline_blocked" | "error">;
  progress?: number;
  meta?: string | null;
  reason?: string | null;
  detail?: string;
  report?: EchoReport;
  registryTrackId?: `0x${string}`;
  registryTxHash?: `0x${string}`;
  registryRef?: `0x${string}`;
  commitmentHash?: `0x${string}`;
};

const PIPELINE_FLOW_STATUSES = new Set(["pipeline_completed", "pipeline_blocked", "error"]);
const DEFAULT_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const authError = authenticatePipelineEvent(request);
  if (authError) {
    return authError;
  }

  const body = (await request.json().catch(() => ({}))) as PipelineEventRequest;

  if (!body.flowId) {
    return NextResponse.json({ error: "Missing flowId" }, { status: 400 });
  }

  try {
    const existingFlow = await getFlow(body.flowId);
    if (!existingFlow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    let step = null;
    if (body.stepKey) {
      step = await updatePipelineStep({
        flowId: body.flowId,
        stepKey: body.stepKey,
        status: body.status,
        progress: body.progress,
        meta: body.meta,
        reason: body.reason,
        detail: body.detail,
      });
    }

    const flowStatus = resolveFlowStatus(body);
    let registryTrackId = body.registryTrackId;
    let registryTxHash = body.registryTxHash;

    if (flowStatus === "pipeline_completed") {
      registryTrackId = await resolveConfirmedRegistryTrackId(body, existingFlow);
      registryTxHash = registryTrackId ? body.registryTxHash : undefined;

      await completePipeline({
        flowId: body.flowId,
        report: body.report,
        registryTrackId: registryTrackId,
        registryTxHash,
        registryRef: body.registryRef,
        commitmentHash: body.commitmentHash,
        clearRegistryTxHash: !registryTxHash,
      });
    } else if (flowStatus === "pipeline_blocked") {
      await blockPipeline({
        flowId: body.flowId,
        report: body.report,
        registryTrackId: body.registryTrackId,
        registryTxHash: body.registryTxHash,
        registryRef: body.registryRef,
        commitmentHash: body.commitmentHash,
        reason: body.reason ?? body.report?.ai_summary ?? "Pipeline blocked",
      });
    } else if (flowStatus === "error") {
      await updatePipelineOutcome(body.flowId, "error", {
        flowId: body.flowId,
        report: body.report,
        registryTrackId: body.registryTrackId,
        registryTxHash: body.registryTxHash,
        registryRef: body.registryRef,
        commitmentHash: body.commitmentHash,
        reason: body.reason ?? "Pipeline failed",
      });
    }

    const [flow, track, pipeline] = await Promise.all([
      getFlow(body.flowId),
      getTrackForFlow(body.flowId),
      getPipelineSteps(body.flowId),
    ]);

    return NextResponse.json({
      success: true,
      flow,
      track,
      pipeline,
      step,
    });
  } catch (error) {
    return handleRouteError(error, { message: "Pipeline event failed" });
  }
}

function authenticatePipelineEvent(request: Request) {
  const secret = process.env.ECHO_PIPELINE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing ECHO_PIPELINE_SECRET" }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const headerSecret = request.headers.get("x-echo-pipeline-secret");

  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized pipeline event" }, { status: 401 });
  }

  return null;
}

function resolveFlowStatus(body: PipelineEventRequest) {
  if (body.flowStatus && PIPELINE_FLOW_STATUSES.has(body.flowStatus)) {
    return body.flowStatus;
  }

  if (body.report?.verdict === "CLEAN") {
    return "pipeline_completed";
  }

  if (body.report?.verdict === "SIMILAR" || body.report?.verdict === "REJECTED") {
    return "pipeline_blocked";
  }

  return undefined;
}

async function resolveConfirmedRegistryTrackId(
  body: PipelineEventRequest,
  existingFlow: Awaited<ReturnType<typeof getFlow>>,
): Promise<`0x${string}` | undefined> {
  if (!existingFlow) {
    return undefined;
  }

  const registryAddress = getRegistryAddress();
  if (!registryAddress) {
    return body.registryTrackId;
  }

  const client = getRegistryClient();
  const commitmentHash = body.commitmentHash ?? existingFlow.commitmentHash;

  if (body.registryTxHash) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: body.registryTxHash });
      if (receipt.status === "success") {
        const sealedTrackId = parseTrackSealedTrackId(receipt.logs, registryAddress, commitmentHash);
        if (sealedTrackId) {
          return sealedTrackId;
        }
      }
    } catch {
      // Receipt can be temporarily unavailable; do not persist an unverified track id.
    }
  }

  if (body.registryTrackId && await isTrackRegisteredOnChain(client, registryAddress, body.registryTrackId)) {
    return body.registryTrackId;
  }

  if (!commitmentHash) {
    return undefined;
  }

  const owner = existingFlow.ownerAddress ?? deriveOwnerKey(existingFlow.walletAddress, existingFlow.nullifierHash);
  const candidate = deriveRegistryTrackId(owner, commitmentHash);
  if (await isTrackRegisteredOnChain(client, registryAddress, candidate)) {
    return candidate;
  }

  return undefined;
}

function deriveRegistryTrackId(owner: `0x${string}` | string, commitmentHash: `0x${string}`): `0x${string}` {
  const paddedOwner = owner.toLowerCase().replace("0x", "").padStart(64, "0");
  const cleanCommitment = commitmentHash.toLowerCase().replace("0x", "");
  return keccak256(`0x${paddedOwner}${cleanCommitment}` as `0x${string}`);
}

function getRegistryAddress(): `0x${string}` | undefined {
  const address = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  return address?.startsWith("0x") ? (address as `0x${string}`) : undefined;
}

function getRegistryClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || DEFAULT_SEPOLIA_RPC_URL),
  });
}
