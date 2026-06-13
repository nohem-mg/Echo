# Echo

Registre open source de *prior-art* musical on-chain — **ETH Global New York 2026** (CNM Agency).

Preuve d'antériorité musicale **trustless, vérifiable, confidentielle et résistante au Sybil**, sans jamais exposer une track non sortie.

## Architecture (monorepo)

| Dossier | Responsable | Stack | Rôle |
| --- | --- | --- | --- |
| [`frontend/`](./frontend) | Marius | Next.js 14 + wagmi + Tailwind | Upload track, World ID, pipeline live, rapport, certificat SEALED |
| [`contracts/`](./contracts) | Cyriac | Foundry (Solidity) | `Registry` + intégration World Router (Base Sepolia) |
| [`cre/`](./cre) | Nohem | Chainlink CRE SDK (TypeScript) | Workflow DAG 4 steps, parallélisation, callback on-chain |
| [`backend/`](./backend) | GAGEXCM | Next.js API / Express + Python | BasicPitch, ACRCloud, algo MIDI, Walrus, Unlink |
| [`docs/`](./docs) | — | Markdown | Documentation technique + répartition des tâches |

## Pipeline (DAG fail-fast)

```
Step 1  BasicPitch        audio -> MIDI                         [STOP si échec]
Step 2  2A ∥ 2B           ACRCloud (public)  ∥  MIDI (registre privé)
                          ≥95 % -> STOP plagiat | ≥75 % -> STOP SIMILAR
Step 3  ISRC -> Spotify -> BasicPitch -> comparaison MIDI commercial   (après 2A)
Step 4  Extraction clé/BPM (audio brut) + rapport final classé         (attend 2B + 3)
```

Verdict `CLEAN` (<75 %) → SEAL on-chain. `SIMILAR`/`REJECTED` → rapport, aucune écriture.

## Démarrage

Chaque package gère ses propres dépendances. Voir le `README.md` de chaque dossier.

```bash
cp .env.example .env   # remplir les clés
```

## Stack

World ID + AgentKit · Chainlink CRE + Confidential AI · Unlink SDK · Walrus (Sui) · Base Sepolia · x402

## Équipe — CNM Agency

Cyriac Mirkovik · Nohem Monnet-Gani · Marius Gal · GAGEXCM
