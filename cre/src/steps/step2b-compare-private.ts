import { post } from "../lib/backend";
import { MidiSequence, RegistryMatch } from "../types";

/** Step 2B — comparaison MIDI vs registre privé (Walrus). */
export async function stepComparePrivate(midi: MidiSequence): Promise<RegistryMatch[]> {
  const res = await post<{ registry_matches: RegistryMatch[] }>("/api/compare/private", {
    midiSequence: midi.midiRef,
  });
  return res.registry_matches;
}
