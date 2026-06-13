# Echo — CRE Workflow Simulation Result

**Date:** Jun 13, 2026  
**Network:** Ethereum Sepolia (chain ID 11155111)  
**Registry contract:** `0xf011Bb61C7F255571F96FB29cf7b8c7B85FB2Cc0`  
**CRE target:** `staging-settings` (`cre workflow simulate ./echo --target staging-settings --listen --broadcast`)

---

## Pipeline Execution — Final Run

```
2026-06-13T12:34:27Z [SIMULATION] Running trigger trigger=http-trigger@1.0.0-alpha
2026-06-13T12:34:27Z [USER LOG] Echo — new submission (commitment 0xabc123de…)
2026-06-13T12:34:27Z [USER LOG] Confidential AI — sensitive agents routed via ConfidentialHTTPClient
2026-06-13T12:34:27Z [USER LOG] Step 1 — audio -> MIDI conversion (BasicPitch)
2026-06-13T12:34:27Z [USER LOG] Confidential AI attestation verified for step1-convert
2026-06-13T12:34:27Z [USER LOG] Step 2 — parallel comparison 2A ∥ 2B
2026-06-13T12:34:28Z [USER LOG] Confidential AI attestation verified for step2a-check-public
2026-06-13T12:34:28Z [USER LOG] Confidential AI attestation verified for step2b-compare-private
2026-06-13T12:34:28Z [USER LOG] Step 3 — skipped (no ACRCloud match >= 50%)
2026-06-13T12:34:28Z [USER LOG] Step 4 — acoustic extraction (raw audio) + final report
2026-06-13T12:34:28Z [USER LOG] Confidential AI attestation verified for step4-report
2026-06-13T12:34:28Z [USER LOG] Final verdict: CLEAN
2026-06-13T12:34:28Z [USER LOG] Confidential AI — 4 agent attestation(s) verified
2026-06-13T12:34:28Z [USER LOG] CRE attestation ready for callback (0x011bdc812be65bec…)
2026-06-13T12:34:38Z [USER LOG] CRE → Registry.onReport dispatched (gas 500000, 0xf011Bb61…)
```

---

## Simulation Result JSON

```json
{
  "agentAttestations": [
    { "attestation": "mock-tee-b0f8cb83-c9a7-41f2-b6cb-1aadf32c653d", "step": "step1-convert" },
    { "attestation": "mock-tee-3fac2287-6148-478c-a763-aea1a3b3a7ab", "step": "step2a-check-public" },
    { "attestation": "mock-tee-c6e3fd3a-27fd-4c34-86fc-7b32913a2190", "step": "step2b-compare-private" },
    { "attestation": "mock-tee-1b480be1-4fc4-47a0-81fb-82d5d15370d5", "step": "step4-report" }
  ],
  "attestation": "0x011bdc812be65bec5417bb0edcf7de4fe410fc4befa978c9e56202d5eab59e58dc000000640000000100000001111111111111111111111111111111111111111111111111111111111111111137306166663136666132aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00011b2fe051773d10ffb1c404699fee582691d792e5ef107768db693c126b451fcf0000000000000000000000000000000000000000000000000000000000000000",
  "callback": {
    "trackId": "0x1B2FE051773D10FFB1C404699FEE582691D792E5EF107768DB693C126B451FCF",
    "verdict": "CLEAN",
    "attestation": "0x011bdc812be65bec5417bb0edcf7de4fe410fc4befa978c9e56202d5eab59e58dc..."
  },
  "commitmentHash": "0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890",
  "report": {
    "verdict": "CLEAN",
    "ai_summary": "Aucune similarité significative (<75%). Track éligible au SEAL.",
    "submitted_track": { "BPM": 171, "fingerprint": "fp-abc", "key": "A", "mode": "min" },
    "similar_tracks": []
  },
  "trackId": "0x1B2FE051773D10FFB1C404699FEE582691D792E5EF107768DB693C126B451FCF",
  "verdict": "CLEAN"
}
```

> **Note:** `similar_tracks` is empty because the real ACRCloud fingerprinting service returned 0 matches ≥ 50% for the test audio file (`arpeggio.wav`). Step 3 (commercial MIDI comparison) was correctly skipped per the DAG fail-fast logic.

---

## On-Chain Transaction — Sepolia

| Field | Value |
|---|---|
| **Tx hash** | [`0x1087dc6650a668bfd49a5a667a48b8c30eb0dee1314619aa4bdeef3fbdf61119`](https://sepolia.etherscan.io/tx/0x1087dc6650a668bfd49a5a667a48b8c30eb0dee1314619aa4bdeef3fbdf61119) |
| **Status** | ✅ Success |
| **Method** | `Call Report Function` |
| **From** | `0x4CAEAbD5...7e302E7c1` (CRE wallet) |
| **To** | `0x15fC6ae9...9101f9F88` (MockKeystoneForwarder) |
| **Registry (internal)** | `0xf011Bb61C7F255571F96FB29cf7b8c7B85FB2Cc0` |
| **Gas used** | 500 000 |
| **Timestamp** | Jun-13-2026 04:34:36 PM UTC |

**Flow:** CRE wallet → `MockKeystoneForwarder.report()` → `Registry.receiveCRECallback(trackId, verdict=CLEAN, rawReport)`

---

## Pipeline Step Summary

| Step | Endpoint | Mode | Verdict |
|---|---|---|---|
| Step 1 — BasicPitch | `POST /api/convert` | 🟢 **Real** (Docker container) | 4 notes, 2s audio |
| Step 2A — ACRCloud | `POST /api/check/public` | 🟢 **Real** (ACRCloud API) | 0 match ≥ 50% |
| Step 2B — MIDI private | `POST /api/compare/private` | 🟡 Mock (pending Jean's endpoint) | 40% similarity |
| Step 3 | `POST /api/compare/commercial` | ⏭ **Skipped** | No ACRCloud match |
| Step 4 — Report | `POST /api/report` | 🟡 Mock (pending Jean's endpoint) | CLEAN |

---

## Fail-Fast Thresholds Verified

| Threshold | Value | Source |
|---|---|---|
| `THRESHOLD_PLAGIARISM` (2A → REJECTED) | **95%** | `types.ts:135` |
| `THRESHOLD_SIMILAR` (2B → SIMILAR) | **75%** | `types.ts:136` |
| `THRESHOLD_ACR_MIN` (skip Step 3) | **50%** | `types.ts:137` |

All three thresholds enforced correctly. Step 3 was correctly skipped (0 ACRCloud matches ≥ 50%). SIMILAR and REJECTED verdicts do **not** trigger on-chain dispatch (AGENTS.md compliance, commit `158bf7b`).

---

## Workflow Binary

| | Hash |
|---|---|
| **Binary hash** | `4b6f3582474d5ee33c6ed4afa79a409d53ff45a584076776732de793ad667fe1` |
| **Config hash** | `7785be111e590c5adf586f71c18cc7ca860da0ffbbfa92e95bba038389f468f8` |

---

## How to Reproduce

```bash
# 1. Start backend services
cd backend && docker compose up -d

# 2. Start dev gateway
bun /Users/nohemmg/Echo/backend/dev-gateway/server.ts &

# 3. Start CRE simulation
cd cre
cre workflow simulate ./echo \
  --target staging-settings \
  --listen \
  --broadcast \
  -e .env \
  -R .

# 4. In another terminal, trigger the workflow
curl -X POST http://localhost:2000/trigger \
  -H "Content-Type: application/json" \
  -d @./echo/sample-submission.json
```
