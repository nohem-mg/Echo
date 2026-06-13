# AGENTS.md — The Loop Protocol

Guide de contexte pour tout agent IA travaillant sur ce repo.
Source de vérité détaillée : [`docs/TheLoopProtocol_ETHGlobalNY2026_FR_v3.md`](./docs/TheLoopProtocol_ETHGlobalNY2026_FR_v3.md)
et la répartition des tâches [`docs/TheLoopProtocol_Tasks_CNM.md`](./docs/TheLoopProtocol_Tasks_CNM.md).

## Le projet en une phrase

Registre open source de *prior-art* musical on-chain : une preuve d'antériorité
**trustless, vérifiable, confidentielle et résistante au Sybil**, sans jamais exposer
une track non sortie. Projet ETH Global New York 2026 (CNM Agency).

## Propriétés à préserver (non négociables)

- **Trustless** — aucun intermédiaire ne peut forger/altérer/supprimer un enregistrement.
- **Vérifiable** — tout tiers peut confirmer indépendamment timestamp + empreinte on-chain.
- **Confidentiel** — l'audio brut et les MIDI ne quittent jamais l'enclave (TEE) ; rien n'est divulgué avant le REVEAL choisi par l'artiste.
- **Résistant au Sybil** — un humain = une inscription (World ID nullifier).

## Pipeline agentique — DAG fail-fast (cœur du système)

```
Step 1  BasicPitch         audio -> MIDI (conversion seule, pas d'analyse)   [STOP si échec]
Step 2  2A ∥ 2B (parallèle)
        2A  ACRCloud        fingerprint acoustique vs base publique -> ISRC + confidence
            >=95 % -> STOP (REJECTED, plagiat)  | 50-94 % -> Step 3  | <50 % -> Step 3 ignoré
        2B  Algo MIDI       similarité compositionnelle vs registre privé (Walrus)
            >=75 % -> STOP (SIMILAR)            | <75 % -> Step 4
Step 3  (démarre dès 2A fini, n'attend pas 2B)
        ISRC -> Spotify preview 30s -> BasicPitch -> comparaison MIDI vs commercial
Step 4  (attend 2B ET 3)
        Extraction clé/mode/BPM/empreinte depuis l'AUDIO BRUT + rapport final classé
        verdict CLEAN -> SEAL on-chain | verdict SIMILAR -> rapport, aucune écriture
```

### Règles d'invariance du pipeline
- **BasicPitch convertit, il n'analyse pas.** La comparaison MIDI est un algorithme séparé (cosinus sur embeddings MIDI).
- Clé / BPM / empreinte s'extraient de **l'audio brut**, jamais du MIDI.
- **Fail-fast strict** : tout halt (plagiat, similar, erreur HTTP/timeout) → aucun état partiel écrit on-chain.
- Seuils : `>=95 %` (2A → REJECTED), `>=75 %` (2B → SIMILAR), `<50 %` ACRCloud → Step 3 ignoré.
- Verdict de rapport : meilleur match `<75 %` → CLEAN/SEAL ; `>=75 %` → SIMILAR, pas d'écriture.

## Architecture du repo

| Dossier | Responsable | Stack | Rôle |
| --- | --- | --- | --- |
| `frontend/` | Marius | Next.js 14 + wagmi + Tailwind | Upload, World ID (IDKit), pipeline live, rapport, certificat SEALED |
| `contracts/` | Cyriac | Foundry (Solidity), Base Sepolia | `Registry` + intégration World Router |
| `cre/` | Nohem | Chainlink CRE SDK (TypeScript) | Orchestration DAG, parallélisation, callback on-chain |
| `backend/` | GAGEXCM | Next.js API / Express + Python | Endpoints pipeline, BasicPitch, ACRCloud, Walrus, Unlink |
| `docs/` | — | Markdown | Documentation technique + tâches |

## Contrats d'interface (endpoints backend consommés par le CRE)

| Endpoint | Entrée | Sortie |
| --- | --- | --- |
| `POST /api/convert` | `{ audioFile }` | `{ midiSequence }` |
| `POST /api/check/public` | `{ audioFile }` | `{ matches: [{ ISRC, confidence_score }] }` |
| `POST /api/compare/private` | `{ midiSequence }` | `{ registry_matches: [{ track_id, similarity_score }] }` |
| `POST /api/compare/commercial` | `{ midiSequence, ISRCs[] }` | `{ commercial_deltas: [{ ISRC, melodic, rhythmic, structural }] }` |
| `POST /api/report` | `{ audioFile, midiSequence, registry_matches, commercial_deltas }` | `{ verdict, submitted_track, similar_tracks[], ai_summary }` |
| `POST /api/storage/upload` | `{ audioFile, metadata }` | `{ blobIds[] }` |

## Smart contract `Registry` (Base Sepolia)

- `Entry { commitmentHash, worldNullifier, timestamp, status, walrusBlobIds[] }`
- `Status { SEALED, REVEALED, SIMILAR, REJECTED }`
- `registerTrack(proof, root, nullifier, commitment, blobIds)` — valide World ID via World Router, anti-Sybil sur le nullifier.
- `receiveCRECallback(verdict, commitmentHash, attestation)` — `onlyCRE`, écrit le verdict final + vérifie l'attestation Confidential AI.
- `revealTrack(trackId, fullProfileHash)` — SEALED → REVEALED.
- `commitmentHash = keccak256(empreinte + profil JSON)` ; `timestamp = block.timestamp`.

## Stack & sponsors (objectif 20 500 $)

- **World ID + AgentKit** — humain unique, Human-Backed Agents, free-trial (3 inscriptions gratuites/humain).
- **Chainlink CRE** — orchestrateur DAG + écriture on-chain.
- **Chainlink Confidential AI** — agents en TEE (Intel TDX) + attestations vérifiables on-chain.
- **Unlink SDK** — paiements x402 privés des agents + upload SoundCloud non-traçable.
- **Walrus (Sui)** — stockage chiffré (audio + métadonnées), blobs immuables.
- **Base Sepolia** — Registry, World Router, pool Unlink. Paiements via **x402**.

## Conventions pour les agents

- **Langue** : documentation et messages en français.
- **Confidentialité d'abord** : ne jamais logguer/exposer d'audio brut ou de MIDI de track non sortie.
- **Ne pas casser le DAG** : respecter parallélisation (2A∥2B), ordre (3 après 2A, 4 après 2B+3) et seuils fail-fast.
- **Frontières de package** : rester dans le périmètre concerné ; toute modif d'interface (ABI, format callback, schéma endpoint) doit être signalée car d'autres en dépendent.
- **Secrets** : jamais commiter `.env` ni clés ; utiliser `.env.example`.
- **Ne pas committer/push sans demande explicite.**
- Avant d'implémenter, se référer aux deux docs dans `docs/` comme source de vérité.
