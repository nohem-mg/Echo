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
- `SEPOLIA_RPC_URL`: optional server RPC URL for transaction verification after the wallet returns a hash. Payment signing itself uses the connected wallet provider.
- `DATABASE_URL`: durable Postgres connection string for persisted Echo flows. Required on Vercel.
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob read/write token for production audio uploads. Required on Vercel.
- `MAX_AUDIO_UPLOAD_MB`: optional server upload limit for `/api/tracks/upload`; defaults to `4`.
- `ECHO_ENABLE_MOCK_WORLD` / `NEXT_PUBLIC_ECHO_ENABLE_MOCK_WORLD`: set both to `false` for the real World ID flow. Mock mode is opt-in only.
- `ECHO_PIPELINE_SECRET`: server-only bearer secret accepted by `/api/pipeline/events` for backend/CRE pipeline updates.
- `CRE_TRIGGER_URL`: optional server-side URL called by `/api/pipeline/start` to start CRE simulation. Local MVP value: `http://localhost:2000/trigger`. Do not set this to the frontend app URL.
- `CRE_TRIGGER_TIMEOUT_MS`: optional timeout for the CRE trigger call; defaults to `45000`.
- `ECHO_SOUNDCLOUD_URL`: optional server-side base URL for the backend SoundCloud gateway/service. Defaults to `http://127.0.0.1:8080`. SoundCloud upload tokens stay in `backend/services/soundcloud-service/.env`.

Check whether the real World config is complete:

```bash
curl http://localhost:3000/api/world/status
```

## Current UI Scope

- Artist-first upload console for WAV/MP3
- World ID proof request through IDKit
- RainbowKit wallet connection on Ethereum Sepolia
- Native ETH fee transaction before pipeline start
- Persisted backend pipeline states initialized after real upload
- Comparison report table fed from persisted `flow.report.similar_tracks`
- SEALED certificate view shown only after `pipeline_completed` plus a confirmed Registry transaction hash
- Post-SEAL SoundCloud publish control for CLEAN tracks, proxied through `/api/soundcloud/upload`
- Responsive desktop/mobile visual system inspired by artist studio and music agency references

## Current Integration State

- World ID uses IDKit Core 4.x request flow when World env vars are configured.
- Payment uses `wagmi` `sendTransaction` to send native ETH on Sepolia.
- The browser computes a local SHA-256 fingerprint for the selected audio file before World ID verification.
- Successful World ID verification creates or reuses a persisted flow with `nullifierHash`, track name, track fingerprint, and status.
- Payment references and transaction hashes are attached to the same persisted flow.
- The backend confirms receipt status, receiver, sender, amount, and reference calldata before audio upload.
- `/api/tracks/upload` validates WAV/MP3 files, recomputes the SHA-256 fingerprint server-side, stores the audio locally in dev or in Vercel Blob in production, and attaches a `trackId` to the paid flow.
- `/api/pipeline/start` initializes persisted pipeline rows, exposes the analysis handoff payload for the backend/CRE workstream, and calls `CRE_TRIGGER_URL` when configured. `analysisInput.trackId` is the frontend upload id; `creInput.trackId` is the Registry bytes32 when known, otherwise a local simulation-only provisional bytes32 derived from the upload id.
- `/api/pipeline/events` is an internal additive callback for backend/CRE updates. Send `Authorization: Bearer $ECHO_PIPELINE_SECRET` or `x-echo-pipeline-secret`, with flexible fields such as `flowId`, `stepKey`, `status`, `progress`, `meta`, `reason`, `report`, `registryTrackId`, `registryTxHash`, `registryRef`, and `commitmentHash`.
- `/api/pipeline/status?flowId=...` returns the current flow, uploaded track, and persisted pipeline steps for UI polling.
- Persistence uses Postgres when `DATABASE_URL` is configured. Local development falls back to `frontend/.data/echo-flows.json`; Vercel requires `DATABASE_URL`.
- Local browser development only falls back to mock World ID proof when both mock env flags are explicitly set to `true`.

## Next Integration Anchors

- Wire backend/CRE workers to call `/api/pipeline/events` as BasicPitch, ACRCloud, private registry comparison, commercial deltas, and report generation complete.
- Feed CLEAN certificate fields from CRE/backend: `commitmentHash`, `registryRef`, `registryTrackId`, and `registryTxHash`.
