import { describe, expect, test } from "bun:test";
import {
  logBlockedPipelineSummary,
  logPlagiarismHalt,
  logRegistrySimilarHalt,
  logStep2ComparisonSnapshot,
  summarizeMidiForLogs,
} from "./marius-logs";
import type { PipelineInput } from "./types";

const INPUT: PipelineInput = {
  flowId: "flow_marius",
  audioRef: "file://backend/fixtures/audio/demo.mp3",
  commitmentHash: "0xabc",
  registryRef: "0xref",
  worldNullifier: "0xnull",
  trackId: "0xtrack",
};

const MIDI = JSON.stringify({ n_notes: 12, duration_s: 4.2, notes: [{ pitch: 60 }] });

function captureLogs(fn: (log: (message: string) => void) => void): string[] {
  const lines: string[] = [];
  fn((message) => lines.push(message));
  return lines;
}

function parseMariusLine(line: string): Record<string, unknown> {
  const jsonStart = line.indexOf("{");
  if (jsonStart < 0) {
    throw new Error(`No JSON payload in log line: ${line}`);
  }
  return JSON.parse(line.slice(jsonStart)) as Record<string, unknown>;
}

describe("marius-logs", () => {
  test("summarizeMidiForLogs keeps only safe numeric fields", () => {
    expect(summarizeMidiForLogs(MIDI)).toEqual({ n_notes: 12, duration_s: 4.2 });
  });

  test("logPlagiarismHalt emits structured MariusAI JSON", () => {
    const lines = captureLogs((log) =>
      logPlagiarismHalt(log, INPUT, MIDI, {
        trigger: { ISRC: "USRC1", confidence_score: 96, title: "Hit Song", artists: ["Artist A"] },
        allMatches: [{ ISRC: "USRC1", confidence_score: 96, title: "Hit Song", artists: ["Artist A"] }],
        coverMatches: [{ ISRC: "USRC2", confidence_score: 72, title: "Cover" }],
        registryMatches: [{ track_id: "priv-1", similarity_score: 40 }],
        report: {
          verdict: "REJECTED",
          similar_tracks: [
            {
              rank: 1,
              title: "Artist A — Hit Song",
              source: "ACRCloud",
              score: 96,
              melody: 96,
              rhythm: 96,
              structure: 96,
              key: "ISRC USRC1",
              BPM: 0,
            },
          ],
          ai_summary: "ACRCloud plagiarism 96%",
        },
        reason: "ACRCloud plagiarism 96%",
      }),
    );

    expect(lines.some((line) => line.startsWith("MariusAI | fail_fast_rejected"))).toBe(true);
    const payload = parseMariusLine(lines.find((line) => line.startsWith("MariusAI | fail_fast_rejected"))!);
    expect(payload.verdict).toBe("REJECTED");
    expect(payload.trigger_match.ISRC).toBe("USRC1");
    expect(payload.report_for_ai.similar_tracks[0].score).toBe(96);
    expect(payload.context.midi).toEqual({ n_notes: 12, duration_s: 4.2 });
    expect(JSON.stringify(payload)).not.toContain('"notes"');
  });

  test("logRegistrySimilarHalt emits MIDI ranking context", () => {
    const lines = captureLogs((log) =>
      logRegistrySimilarHalt(log, INPUT, MIDI, {
        trigger: { track_id: "priv-99", similarity_score: 82, global_overlap: 55.1, hook: 82 },
        allMatches: [
          { track_id: "priv-99", similarity_score: 82, global_overlap: 55.1, hook: 82 },
          { track_id: "priv-12", similarity_score: 61 },
        ],
        acrMatches: [{ ISRC: "USRC9", confidence_score: 52 }],
        report: {
          verdict: "SIMILAR",
          similar_tracks: [
            {
              rank: 1,
              title: "Track privée priv-99…",
              source: "Registre privé",
              score: 82,
              melody: 82,
              rhythm: 82,
              structure: 82,
              key: "priv-99",
              BPM: 0,
            },
          ],
          ai_summary: "private registry match 82%",
        },
        reason: "private registry match 82%",
      }),
    );

    expect(lines.some((line) => line.startsWith("MariusAI | fail_fast_similar"))).toBe(true);
    const payload = parseMariusLine(lines.find((line) => line.startsWith("MariusAI | fail_fast_similar"))!);
    expect(payload.registry_ranking).toHaveLength(2);
    expect(payload.trigger_match.global_overlap).toBe(55.1);
  });

  test("logStep2ComparisonSnapshot lists eligible Step 3 candidates", () => {
    const lines = captureLogs((log) =>
      logStep2ComparisonSnapshot(log, INPUT, MIDI, {
        acrMatches: [
          { ISRC: "A", confidence_score: 68 },
          { ISRC: "B", confidence_score: 44 },
        ],
        registryMatches: [{ track_id: "t1", similarity_score: 30 }],
      }),
    );

    const payload = parseMariusLine(lines.find((line) => line.startsWith("MariusAI | step2_snapshot"))!);
    expect(payload.step2a_acrcloud.eligible_for_step3).toHaveLength(1);
    expect(payload.step2a_acrcloud.eligible_for_step3[0].ISRC).toBe("A");
  });

  test("logBlockedPipelineSummary repeats terminal verdict for consumers", () => {
    const lines = captureLogs((log) =>
      logBlockedPipelineSummary(log, INPUT, {
        verdict: "SIMILAR",
        reason: "private registry match 80%",
        report: { verdict: "SIMILAR", similar_tracks: [], ai_summary: "blocked" },
      }),
    );

    expect(lines[0]).toContain("pipeline_blocked_summary");
    expect(parseMariusLine(lines[0]).flowId).toBe("flow_marius");
  });
});
