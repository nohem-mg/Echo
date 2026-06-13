import { post } from "../lib/backend";
import { AcrMatch } from "../types";

/** Step 2A — ACRCloud : fingerprint acoustique vs base publique. */
export async function stepCheckPublic(audioRef: string): Promise<AcrMatch[]> {
  const res = await post<{ matches: AcrMatch[] }>("/api/check/public", {
    audioFile: audioRef,
  });
  return res.matches;
}
