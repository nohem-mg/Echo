// Contrats d'interface du pipeline (verdict, payloads, seuils).
// TODO (Nohem): définir les types partagés avec le backend et le callback on-chain.

export type Verdict = "CLEAN" | "SIMILAR" | "REJECTED" | "ERROR";

// Seuils fail-fast (cf. doc technique §3)
export const THRESHOLD_PLAGIARISM = 95; // 2A -> REJECTED
export const THRESHOLD_SIMILAR = 75; //   2B -> SIMILAR
export const THRESHOLD_ACR_MIN = 50; //   <50 % -> Step 3 ignoré
