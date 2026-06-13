export const echoConfig = {
  worldAppId: process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "",
  worldRpId: process.env.NEXT_PUBLIC_WORLD_RP_ID ?? "",
  worldAction: process.env.NEXT_PUBLIC_WORLD_ACTION ?? "echo-seal-track",
  worldEnvironment: process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT === "production" ? "production" : "staging",
  mockWorldEnabled: process.env.NEXT_PUBLIC_ECHO_ENABLE_MOCK_WORLD === "true",
  paymentAmountWld: Number(process.env.NEXT_PUBLIC_PAYMENT_AMOUNT_WLD ?? "0.1"),
  paymentDescription: process.env.NEXT_PUBLIC_PAYMENT_DESCRIPTION ?? "Echo prior-art seal",
  registryChainId: Number(process.env.NEXT_PUBLIC_REGISTRY_CHAIN_ID ?? "4801"),
  registryAddress: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? "",
  registryExplorer: process.env.NEXT_PUBLIC_REGISTRY_EXPLORER ?? "https://worldchain-sepolia.explorer.alchemy.com",
} as const;

export function isWorldConfigured() {
  return Boolean(echoConfig.worldAppId && echoConfig.worldRpId);
}
