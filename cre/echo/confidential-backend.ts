// ==========================================================================
// Echo — Confidential HTTP client for sensitive pipeline agents
// --------------------------------------------------------------------------
// Routes backend calls through ConfidentialHTTPClient so unreleased audio /
// MIDI never transits in plain node memory. Sensitive fields are injected via
// templatePublicValues inside the TEE enclave (see Chainlink CRE docs).
// ==========================================================================

import {
  ConfidentialHTTPClient,
  httpRequest,
  json,
  ok,
  type Runtime,
} from "@chainlink/cre-sdk";
import type { CONFIDENTIAL_HTTP_CLIENT_PB } from "@chainlink/cre-sdk/pb";

type HTTPResponse = CONFIDENTIAL_HTTP_CLIENT_PB.HTTPResponse;
import {
  createAttestationCollector,
  requireAgentAttestation,
  type AttestationCollector,
} from "./attestation";
import { BackendError, type Deferred } from "./backend";

export type ConfidentialClientContext = {
  collector: AttestationCollector;
};

export type ConfidentialClientOptions = {
  secretsOwner?: string;
  /** Optional Vault DON secret for backend API key (Authorization header). */
  backendApiKeySecret?: string;
  timeoutSeconds?: number;
};

const DEFAULT_TIMEOUT_SECONDS = 30;

/**
 * Deferred POST via ConfidentialHTTPClient (enclave execution, no runInNodeMode).
 * Parses JSON body and verifies a TEE attestation header is present.
 */
export function confidentialBackendPost<TConfig, TResponse>(
  runtime: Runtime<TConfig>,
  baseUrl: string,
  path: string,
  step: string,
  bodyTemplate: {
    bodyString: string;
    templatePublicValues: Record<string, string>;
  },
  ctx: ConfidentialClientContext,
  options: ConfidentialClientOptions = {},
): Deferred<TResponse> {
  const url = `${baseUrl}${path}`;
  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const confClient = new ConfidentialHTTPClient();

  const vaultDonSecrets = options.backendApiKeySecret
    ? [{ key: options.backendApiKeySecret, owner: options.secretsOwner ?? "" }]
    : [];

  const handle = confClient.sendRequest(runtime, {
    request: httpRequest({
      url,
      method: "POST",
      bodyString: bodyTemplate.bodyString,
      templateValues: bodyTemplate.templatePublicValues,
      timeout: `${timeoutSeconds}s`,
      headers: options.backendApiKeySecret
        ? { Authorization: [`Bearer {{.${options.backendApiKeySecret}}}`] }
        : undefined,
    }),
    vaultDonSecrets,
  });

  return {
    result: () => {
      const response: HTTPResponse = handle.result();
      const statusCode = response.statusCode;
      if (!ok(response)) {
        throw new BackendError(path, statusCode, `${path} -> HTTP ${statusCode}`);
      }

      const agentAttestation = requireAgentAttestation(response, step);
      ctx.collector.push(agentAttestation);
      runtime.log(`Confidential AI attestation verified for ${step}`);

      return json(response) as TResponse;
    },
  };
}

/** Factory for a fresh attestation collector + context object. */
export function createConfidentialContext(): ConfidentialClientContext {
  return { collector: createAttestationCollector() };
}
