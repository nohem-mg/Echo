import { post } from "../lib/backend";
import { MidiSequence } from "../types";

/** Step 1 — BasicPitch : audio brut -> MIDI. Bloque 2A et 2B. */
export async function stepConvert(audioRef: string): Promise<MidiSequence> {
  return post<MidiSequence>("/api/convert", { audioFile: audioRef });
}
