import type { PipelineInput } from "./types";

/** Accepts flat PipelineInput JSON or `{ input: PipelineInput }` (sample-submission.json). */
export function parsePipelineInput(raw: unknown): PipelineInput {
  const obj = raw as Record<string, unknown>;
  if (obj.input && typeof obj.input === "object") {
    return obj.input as PipelineInput;
  }
  return obj as PipelineInput;
}
