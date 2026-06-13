export const echoConfig = {
  worldAppId: process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "",
  worldRpId: process.env.NEXT_PUBLIC_WORLD_RP_ID ?? "",
  worldAction: process.env.NEXT_PUBLIC_WORLD_ACTION ?? "echo-seal-track",
  worldEnvironment: process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT === "production" ? "production" : "staging",
  mockWorldEnabled: process.env.NEXT_PUBLIC_ECHO_ENABLE_MOCK_WORLD === "true",
  flowFeeEth: process.env.NEXT_PUBLIC_FLOW_FEE_ETH ?? "0.001",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  registryChainId: Number(process.env.NEXT_PUBLIC_REGISTRY_CHAIN_ID ?? "11155111"),
  registryAddress: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? "",
  registryExplorer: process.env.NEXT_PUBLIC_REGISTRY_EXPLORER ?? "https://sepolia.etherscan.io",
} as const;

export function isWorldConfigured() {
  return Boolean(echoConfig.worldAppId && echoConfig.worldRpId);
}
