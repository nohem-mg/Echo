import type { EchoReport } from "@/lib/types";

export const mockReports: Record<"CLEAN" | "SIMILAR" | "REJECTED", EchoReport> = {
  CLEAN: {
    verdict: "CLEAN",
    submitted_track: {
      key: "A",
      mode: "min",
      BPM: 124,
      fingerprint: "mock-clean-fingerprint",
    },
    similar_tracks: [
      {
        rank: 1,
        title: "Night Glass - Luma Vale",
        score: 21,
        melody: 18,
        rhythm: 24,
        structure: 20,
        key: "A min",
        BPM: 124,
        source: "ACRCloud",
      },
      {
        rank: 2,
        title: "@artist_9x7 - [SEALED]",
        score: 14,
        melody: 16,
        rhythm: 12,
        structure: 15,
        key: "C maj",
        BPM: 121,
        source: "Private registry",
      },
    ],
    ai_summary: "Mock mode: no significant similarity crossed the 75% threshold.",
  },
  SIMILAR: {
    verdict: "SIMILAR",
    similar_tracks: [
      {
        rank: 1,
        title: "Similar Composition - Sealed #39a5",
        score: 82,
        melody: 85,
        rhythm: 78,
        structure: 83,
        key: "A min",
        BPM: 124,
        source: "Private registry",
      },
    ],
    ai_summary: "Mock mode: a private registry composition crossed the similarity threshold.",
  },
  REJECTED: {
    verdict: "REJECTED",
    similar_tracks: [
      {
        rank: 1,
        title: "Matched Public Track (ACRCloud)",
        score: 97,
        melody: 92,
        rhythm: 98,
        structure: 90,
        key: "G min",
        BPM: 128,
        source: "ACRCloud (ISRC: US-RC1-23-45678)",
      },
    ],
    ai_summary: "Mock mode: an acoustic fingerprint match crossed the 95% rejection threshold.",
  },
};
