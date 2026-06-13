# CRE Workflow & Agents IA — The Loop Protocol

Responsable : **Nohem** · Stack : Chainlink CRE SDK (TypeScript) + Confidential AI.

## Rôle

Orchestrateur central du pipeline. Définit le DAG 4 steps, gère la parallélisation
`2A ∥ 2B`, la synchronisation (`Step 4` attend `2B` ET `3`), la logique fail-fast,
et l'écriture finale du verdict on-chain via callback vers le contrat `Registry`.

## DAG

```
Step 1  /api/convert            audio -> MIDI                       [STOP si échec]
Step 2  2A: /api/check/public   ∥   2B: /api/compare/private
        2A ≥95 % -> REJECTED (halt)   |   2B ≥75 % -> SIMILAR (halt)
Step 3  /api/compare/commercial (après 2A, si matches non vides)
Step 4  /api/report             (attend 2B + 3) -> verdict
Callback  receiveCRECallback(verdict, commitmentHash, attestation)
```

## Fail-fast

- Tout step en erreur HTTP / timeout → `ERROR`, halt.
- Aucun état partiel écrit on-chain en cas de halt.

## Dépendances inter-équipes

- **GAGEXCM** — endpoints backend
- **Cyriac** — adresse `Registry` + ABI (callback)
- **Chainlink** — sandbox Confidential AI + credentials CRE

## Setup (à faire)

```bash
npm install
# configurer credentials CRE dans .env (racine)
# simuler : cre simulate
```

## Structure

```
src/
  workflow.ts       # définition du DAG (entrée)
  steps/            # 1 fichier par step
  lib/backend.ts    # client HTTP vers les endpoints GAGEXCM
  types.ts          # contrats d'interface (verdict, payloads)
```
