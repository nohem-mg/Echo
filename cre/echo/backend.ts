// ==========================================================================
// Echo — CRE HTTP client for backend endpoints (GAGEXCM)
// ==========================================================================
// In CRE, network calls run in "node mode": each DON node performs the
// request, then results are aggregated via consensus.
// We return the raw response body (string = primitive type) to pass through
// `identical` consensus without a schema, then parse in DON mode.
// The `.result()` pattern replaces `await` (unavailable in WASM).
// ==========================================================================

import {
  HTTPClient,
  consensusIdenticalAggregation,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk";

export class BackendError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

// Deferred handle: call is initiated, `.result()` forces resolution.
// Enables parallelization (start 2A and 2B, then resolve both).
export type Deferred<T> = { result: () => T };

/**
 * Deferred POST JSON to a backend endpoint (node mode + consensus).
 *
 * @param runtime   DON runtime (handler)
 * @param baseUrl   Backend base URL (config)
 * @param path      Endpoint path (e.g. "/api/convert")
 * @param body      Serializable JSON body
 * @param timeoutMs Per-request timeout (fail-fast)
 * @param headers   Optional extra HTTP headers (e.g. AgentKit auth)
 * @returns         Handle whose `.result()` returns the parsed response
 */
export function backendPost<TConfig, TResponse>(
  runtime: Runtime<TConfig>,
  baseUrl: string,
  path: string,
  body: unknown,
  timeoutMs = 30_000,
  headers?: Record<string, string>,
): Deferred<TResponse> {
  const url = `${baseUrl}${path}`;
  const payload = JSON.stringify(body);

  // Executed by each DON node.
  const fetchInNode = (nodeRuntime: NodeRuntime<TConfig>): string => {
    const http = new HTTPClient();
    const resp = http
      .sendRequest(nodeRuntime, {
        url,
        method: "POST",
        body: new TextEncoder().encode(payload),
        // google.protobuf.Duration as JSON = suffix string "s".
        timeout: `${Math.floor(timeoutMs / 1000)}s`,
        ...(headers ? { headers } : {}),
      })
      .result();

    const statusCode = resp.statusCode;
    if (statusCode < 200 || statusCode >= 300) {
      // Fail-fast: any non-2xx response halts the pipeline.
      throw new BackendError(path, statusCode, `${path} -> HTTP ${statusCode}`);
    }
    return new TextDecoder().decode(resp.body);
  };

  // Node-mode call is initiated here; parsing happens on resolution.
  const handle = runtime.runInNodeMode(fetchInNode, consensusIdenticalAggregation<string>())();
  return { result: () => JSON.parse(handle.result()) as TResponse };
}
