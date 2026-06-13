# Echo Frontend

Next.js, TypeScript, and Tailwind frontend for Echo, the confidential prior-art registry for unreleased music.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- lucide-react icons

## Commands

```bash
npm run dev
npm run lint
npm run build
```

The local app runs at http://localhost:3000 by default.

## Current UI Scope

- Artist-first upload console for WAV/MP3
- World ID and wallet action anchors
- Simulated confidential pipeline states
- Comparison report table with score tones
- SEALED certificate preview with hash and Basescan actions
- Responsive desktop/mobile visual system inspired by artist studio and music agency references

## Integration Anchors

- World ID IDKit proof should replace the current `Verify World ID` placeholder.
- wagmi/viem wallet connection should replace the current `Connect` placeholder.
- Backend/CRE status streaming should feed `pipelineSteps`.
- Final report API should replace the mock `matches` data.
- Registry ABI/address should feed certificate and reveal actions.
