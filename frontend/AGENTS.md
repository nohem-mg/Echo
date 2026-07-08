<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Source layout (`src/`)

The home page (`app/page.tsx`) is a thin composition root: it wires two hooks
into section components and holds no business logic or markup of its own.

```
lib/
  config.ts · types.ts · flow-store · server-env.ts    core modules shared with API routes
  registry-handoff.ts · sound-design.ts · abi/
  hooks/      use-echo-flow · use-audio-preview · use-flow-history
              use-echo-sound-effects · use-echo-button-sounds · use-unlink-escrow
  flow/       report · flow-status · pipeline-display · mock-reports   (pure domain logic)
  services/   soundcloud · agentkit · world-id                          (external systems)
  utils/      api-error · audio · encoding                              (generic helpers)

components/
  common/     wallet-connect-control · unlink-deposit-panel · echo-button-sounds
  home/       one folder per page section:
    layout/   site-header · bottom-nav
    hero/     hero-panel · vinyl-visual · sponsor-marquee
    console/  register-console · upload-dropzone · flow-history-panel
              pipeline-step-list · world-id-qr-modal
    pipeline/ pipeline-section
    report/   report-section
    seal/     seal-certificate · artist-controls · sell-rights-modal
  marketplace/  listing panel + licensing components
```

Conventions:
- `lib/` root holds only cross-cutting modules the server-side API routes also
  import (`flow-store`, `server-env`, `config`, `types`, `registry-handoff`).
  These paths are relied on by `app/api/**` — do not move them without updating routes.
- Domain logic (`lib/flow/`) and external-service wrappers (`lib/services/`) are
  pure and unit-testable; keep React/`wagmi` out of them.
- `components/home/<section>/` mirrors the page's visual sections. A widget used by
  more than one section lives in `components/common/`.
- `useEchoFlow` (`lib/hooks/`) is the single orchestrator for the seal flow
  (verify → pay → pipeline → reveal → publish). Prefer extending it over adding
  parallel state to `page.tsx`.

## Known gaps (current build)

- **Flow-fee payment is mocked** — `useEchoFlow` advances the flow through
  `payments/create`/`confirm` without sending a wallet transaction. The live
  receipt-watching path is still present but bypassed.
- **World ID mock mode** — `NEXT_PUBLIC_ECHO_ENABLE_MOCK_WORLD=true` lets the flow
  run without a real proof (server-side too). Keep it off in any shared deployment.
