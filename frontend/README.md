# Echo Frontend

Next.js, TypeScript, and Tailwind frontend for Echo, the confidential prior-art registry for unreleased music.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- World MiniKit / IDKit integration target
- lucide-react icons

## Commands

```bash
npm run dev
npm run lint
npm run build
```

The local app runs at http://localhost:3000 by default.

## Environment

Copy `.env.local.example` to `.env.local` before wiring real World credentials.

```bash
cp .env.local.example .env.local
```

Important variables:

- `NEXT_PUBLIC_WORLD_APP_ID`: World Developer Portal app id.
- `NEXT_PUBLIC_WORLD_RP_ID`: World ID 4.0 relying party id.
- `WORLD_RP_SIGNING_KEY`: server-only RP signing key for IDKit requests.
- `WORLD_DEV_PORTAL_API_KEY`: server-only key for MiniKit payment verification.
- `PAYMENT_RECEIVER_ADDRESS`: World App payment receiver.
- `ECHO_ENABLE_MOCK_WORLD` / `NEXT_PUBLIC_ECHO_ENABLE_MOCK_WORLD`: set both to `false` for the real flow. Mock mode is opt-in only.

Check whether the real World config is complete:

```bash
curl http://localhost:3000/api/world/status
```

## Current UI Scope

- Artist-first upload console for WAV/MP3
- World ID and World App Pay action anchors
- Simulated confidential pipeline states
- Comparison report table with score tones
- SEALED certificate preview with hash and explorer actions
- Responsive desktop/mobile visual system inspired by artist studio and music agency references

## Integration Anchors

- World ID / MiniKit proof should replace the current `Verify World ID` placeholder.
- MiniKit Pay should replace the current `Pay in World App` placeholder.
- Payment confirmation must be verified on the backend before starting CRE.
- Backend/CRE status streaming should feed `pipelineSteps`.
- Final report API should replace the mock `matches` data.
- Registry ABI/address should feed certificate and reveal actions.

## Payment Direction

The MVP UX should not require MetaMask. The target flow is World App first:

1. Verify World ID.
2. Request payment through MiniKit Pay.
3. Confirm the payment on the backend.
4. Start the confidential pipeline.
5. Write the final clean verdict to the Registry.

MiniKit Pay payments are World App / World Chain oriented. If the Registry is deployed on Base Sepolia, the backend or CRE should relay the registry transaction after payment confirmation.

## Current Integration State

- MiniKit provider is mounted at the app root.
- World ID uses IDKit Core 4.x request flow when World env vars are configured.
- Payment uses `MiniKit.pay` when a real receiver is configured.
- Local browser development only falls back to mock proof/payment when both mock env flags are explicitly set to `true`.
- API routes exist for RP signature, proof verification, payment reference creation, and payment confirmation.
