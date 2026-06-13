# Echo

Registre open source de *prior-art* musical on-chain — **ETH Global New York 2026** (CNM Agency).

Preuve d'antériorité musicale **trustless, vérifiable, confidentielle et résistante au Sybil**, sans jamais exposer une track non sortie.

## Architecture (monorepo)

| Dossier | Responsable | Stack | Rôle |
| --- | --- | --- | --- |
| [`frontend/`](./frontend) | Marius | Next.js + Tailwind + World MiniKit | Upload track, World ID, paiement World App, pipeline live, rapport, certificat SEALED |
| [`contracts/`](./contracts) | Cyriac | Foundry (Solidity) | `Registry` + intégration World Router (Base Sepolia ou World Chain Sepolia) |
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

World ID + World App MiniKit Pay · AgentKit · Chainlink CRE + Confidential AI · Unlink SDK · Walrus (Sui) · Base Sepolia / World Chain Sepolia · x402

## Décision produit — paiement utilisateur

Le MVP ne doit pas exposer MetaMask comme prérequis utilisateur. Le flow cible est :

1. L'artiste ouvre Echo dans World App.
2. Il vérifie son humanité via World ID.
3. Il paie le lancement du pipeline avec World App MiniKit Pay.
4. Le backend vérifie le paiement côté serveur avant de déclencher CRE.
5. Après verdict `CLEAN`, le Registry est écrit on-chain.

MiniKit Pay retourne des paiements sur `worldchain`. Si le Registry reste sur Base Sepolia pour les tracks sponsors, le backend/CRE agit comme relayer après paiement confirmé. Si on veut une UX entièrement World-native, on déploie aussi le Registry sur World Chain Sepolia.

## Équipe — CNM Agency

Cyriac Mirkovik · Nohem Monnet-Gani · Marius Gal · GAGEXCM
