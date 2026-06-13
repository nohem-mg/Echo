# Echo Frontend

Next.js, TypeScript, Tailwind, World ID, RainbowKit, wagmi, and viem frontend for Echo, the confidential prior-art registry for unreleased music.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- World ID / IDKit for proof of human
- RainbowKit + wagmi + viem for EVM wallet and Sepolia fee payment
- lucide-react icons

## Commands

```bash
npm run dev
npm run lint
npm run build
```

The local app runs at http://localhost:3000 by default.

## Environment

Copy `.env.local.example` to `.env.local` before wiring real credentials.

```bash
cp .env.local.example .env.local
```

Important variables:

- `NEXT_PUBLIC_WORLD_APP_ID`: World Developer Portal app id.
- `NEXT_PUBLIC_WORLD_RP_ID`: World ID 4.0 relying party id.
- `WORLD_RP_SIGNING_KEY`: server-only RP signing key for IDKit requests.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: WalletConnect Cloud project id used by RainbowKit.
- `NEXT_PUBLIC_FEE_RECEIVER_ADDRESS`: EVM address receiving the Sepolia fee.
- `NEXT_PUBLIC_FLOW_FEE_ETH`: native ETH amount required before the flow starts.
- `SEPOLIA_RPC_URL`: optional server RPC URL for transaction verification; viem uses the public Sepolia RPC fallback if empty.
- `ECHO_ENABLE_MOCK_WORLD` / `NEXT_PUBLIC_ECHO_ENABLE_MOCK_WORLD`: set both to `false` for the real World ID flow. Mock mode is opt-in only.

Check whether the real World config is complete:

```bash
curl http://localhost:3000/api/world/status
```

## Current UI Scope

- Artist-first upload console for WAV/MP3
- World ID proof request through IDKit
- RainbowKit wallet connection on Ethereum Sepolia
- Native ETH fee transaction before pipeline start
- Simulated confidential pipeline states
- Comparison report table with score tones
- SEALED certificate preview with hash and explorer actions
- Responsive desktop/mobile visual system inspired by artist studio and music agency references

## Current Integration State

- World ID uses IDKit Core 4.x request flow when World env vars are configured.
- Payment uses `wagmi` `sendTransaction` to send native ETH on Sepolia.
- The backend confirms receipt status, receiver, sender, amount, and reference calldata before starting the UI pipeline.
- Local browser development only falls back to mock World ID proof when both mock env flags are explicitly set to `true`.

## Next Integration Anchors

- Replace mock pipeline rows with backend/CRE status streaming.
- Persist used payment hashes/references server-side before production.
- Replace mock comparison report data with the final report API.
- Feed certificate/reveal actions from the deployed registry ABI/address.
