export function mockWorldEnabled() {
  return process.env.ECHO_ENABLE_MOCK_WORLD === "true" || process.env.NEXT_PUBLIC_ECHO_ENABLE_MOCK_WORLD === "true";
}

/**
 * When on, the pipeline refuses to start for a flow that has not paid the flow
 * fee. Off by default because flow-fee payment is currently mocked (see
 * frontend/AGENTS.md); set ECHO_ENFORCE_PAYMENT=true in prod/staging.
 */
export function paymentEnforced() {
  return process.env.ECHO_ENFORCE_PAYMENT === "true";
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}
