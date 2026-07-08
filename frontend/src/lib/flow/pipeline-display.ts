import type { EchoPipelineStep } from "@/lib/types";

export type StepState = "idle" | "active" | "done" | "blocked";

export type DisplayStep = {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  status?: string;
  reason?: string;
};

/** Placeholder steps shown before the live pipeline reports anything. */
export const DEFAULT_PIPELINE_STEPS: DisplayStep[] = [
  {
    id: "01",
    title: "Audio to MIDI",
    detail: "BasicPitch profile",
    meta: "00:18",
  },
  {
    id: "02A",
    title: "Public fingerprint",
    detail: "ACRCloud sweep",
    meta: "41% match",
  },
  {
    id: "02B",
    title: "Private registry",
    detail: "Encrypted MIDI registry scan",
    meta: "12% match",
  },
  {
    id: "03",
    title: "Final report",
    detail: "CRE pipeline summary",
    meta: "CLEAN",
  },
];

export function getLiveStepState(status?: string): StepState {
  if (status === "running") return "active";
  if (status === "done") return "done";
  if (status === "blocked" || status === "error") return "blocked";
  return "idle";
}

/**
 * Maps live pipeline steps to the 4-slot display layout: step 03 (commercial
 * check) is hidden and step 04 (final report) takes its display slot.
 */
export function buildDisplaySteps(livePipelineSteps: EchoPipelineStep[]): DisplayStep[] {
  if (livePipelineSteps.length === 0) {
    return DEFAULT_PIPELINE_STEPS;
  }

  return livePipelineSteps
    .filter((s) => s.stepKey !== "03")
    .map((s) => ({
      id: s.stepKey === "04" ? "03" : s.stepKey,
      title: s.label,
      detail: s.detail === "Ready for ISRC preview comparison" ? "CRE pipeline summary" : s.detail,
      meta: s.meta || (s.status === "running" ? `${s.progress}%` : undefined),
      status: s.status,
      reason: s.reason,
    }));
}
