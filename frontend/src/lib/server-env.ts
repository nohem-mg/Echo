export function mockWorldEnabled() {
  return process.env.ECHO_ENABLE_MOCK_WORLD === "true" || process.env.NEXT_PUBLIC_ECHO_ENABLE_MOCK_WORLD === "true";
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}
