  
**ECHO**

Répartition des tâches — Équipe CNM Agency

**ETH Global New York 2026**

| MARIUS *Front-end & UX* | CYRIAC *Smart Contracts* | NOHEM *CRE & Agents IA* | GAGEXCM *Backend & Pipeline* |
| :---: | :---: | :---: | :---: |

| □ MVP — indispensable pour la démo hackathon | □ IMP — important pour les prix sponsors | □ BONUS — nice-to-have si temps disponible |
| :---- | :---- | :---- |

CNM Agency  —  Juin 2026  
**CYRIAC** 

  *Front-end & UX  —  Echo  —  ETH Global New York 2026*

| MVP — indispensable pour la démo hackathon | IMP — important pour les prix sponsors | BONUS — nice-to-have si temps disponible |
| :---- | :---- | :---- |

| Dépend de | Cyriac — adresse du contrat Registry (Base Sepolia) \+ ABINohem — endpoint CRE webhook (verdict pipeline)GAGEXCM — endpoints API backend (/convert, /compare, /report) |
| :---- | :---- |

**1\. Setup & Configuration**

- [ ] Init projet Next.js 14 \+ TypeScript  *\[MVP\]*  
- [ ] Setup wagmi \+ viem configuré sur Base Sepolia  *\[MVP\]*  
- [ ] Setup Tailwind CSS \+ design system (couleurs, typo)  *\[MVP\]*  
- [ ] Variables d’environnement (.env) : RPC URL, adresse contrat, clés API  *\[MVP\]*  
- [ ] Connexion wallet : MetaMask \+ World App (wagmi)  *\[MVP\]*

**2\. World ID**

- [ ] Intégrer le widget IDKit World ID (v4.0) dans la page d’upload  *\[MVP\]*  
- [ ] Récupérer proof, root, nullifierHash, externalNullifierHash → passer au backend  *\[MVP\]*  
- [ ] Gérer état vérifié / non vérifié dans le composant  *\[MVP\]*

**3\. Upload & Pipeline**

- [ ] Page upload audio : drag & drop WAV/MP3, validation format/taille  *\[MVP\]*  
- [ ] Affichage du pipeline en temps réel (Step 1 → 4\) avec statuts progress  *\[MVP\]*  
- [ ] Indicateurs visuels par step : en cours / OK / STOP (avec raison)  *\[MVP\]*  
- [ ] Gérer les cas STOP : plagiat évident (≥95 %), SIMILAR (≥75 %), erreur TEE  *\[MVP\]*

**4\. Rapport de Comparaison**

- [ ] Composant tableau rapport final : rank, titre, source, score global, dimensions  *\[MVP\]*  
- [ ] Code couleur scores : rouge (≥75 %), orange (50–74 %), vert (\< 50 %)  *\[MVP\]*  
- [ ] Afficher verdict final CLEAN / SIMILAR en haut du rapport  *\[MVP\]*  
- [ ] Résumé IA (ai\_summary) affiché sous le tableau  *\[IMP\]*

**5\. Certificat SEALED**

- [ ] Page certificat : afficher commitmentHash, timestamp, statut SEALED  *\[MVP\]*  
- [ ] Lien Basescan vers la transaction on-chain  *\[MVP\]*  
- [ ] Bouton « Copier le hash »  *\[IMP\]*  
- [ ] Bouton « Reveal » (SEALED → REVEALED) avec confirmation wallet  *\[IMP\]*

**6\. SoundCloud Publish (bonus)**

- [ ] UI optionnelle post-SEAL : « Publier sur SoundCloud »  *\[BONUS\]*  
- [ ] Formulaire titre \+ description \+ privacy settings  *\[BONUS\]*  
- [ ] Afficher confirmation de publication avec lien SoundCloud  *\[BONUS\]*

**7\. World App Mini App (bonus)**

- [ ] Configurer Mini App dans World App Developer Portal  *\[BONUS\]*  
- [ ] Adapter le viewport et la nav pour World App (mobile-first)  *\[BONUS\]*  
- [ ] Test sur simulateur World App  *\[BONUS\]*

  **CYRIAC MIRKOVIK**

  *Smart Contracts  —  Echo  —  ETH Global New York 2026*

| □ MVP — indispensable pour la démo hackathon | □ IMP — important pour les prix sponsors | □ BONUS — nice-to-have si temps disponible |
| :---- | :---- | :---- |

| Dépend de | Nohem — format exact du callback CRE (champs, types)GAGEXCM — walrusBlobIds (format des références Walrus)Marius — ABI du contrat Registry (pour intégration front wagmi) |
| :---- | :---- |

**1\. Setup**

* **□**  Init projet Foundry (ou Hardhat) \+ dépendances  *\[MVP\]*

* **□**  Configurer .env : RPC Base Sepolia, clé privée deployer, Basescan API key  *\[MVP\]*

* **□**  Vérifier accès au World Router déployé sur Base Sepolia  *\[MVP\]*

**2\. Contrat Registry**

* **□**  Définir struct Entry { commitmentHash, worldNullifier, timestamp, status, walrusBlobIds\[\] }  *\[MVP\]*

* **□**  Mapping trackId → Entry \+ mapping artiste → trackIds\[\]  *\[MVP\]*

* **□**  Enum Status { SEALED, REVEALED, SIMILAR, REJECTED }  *\[MVP\]*

* **□**  Fonction registerTrack(proof, root, nullifier, commitment, blobIds) — appelle World Router  *\[MVP\]*

* **□**  Vérification nullifier World ID on-chain avant toute écriture (revert si invalide)  *\[MVP\]*

* **□**  Événement TrackRegistered(address artist, bytes32 commitment, uint256 timestamp)  *\[MVP\]*

* **□**  Modifier onlyCRE pour sécuriser le callback CRE  *\[MVP\]*

* **□**  Fonction receiveCRECallback(verdict, commitmentHash, attestation) — écrit le statut final  *\[MVP\]*

* **□**  Vérification attestation Chainlink Confidential AI dans le callback  *\[IMP\]*

* **□**  Écouter confirmation paiement Unlink avant finalisation SEAL  *\[IMP\]*

* **□**  Fonction revealTrack(trackId, fullProfileHash) — SEALED → REVEALED  *\[IMP\]*

**3\. Sécurité & Tests**

* **□**  Test : registerTrack avec World ID valide → succès  *\[MVP\]*

* **□**  Test : registerTrack avec World ID invalide → revert  *\[MVP\]*

* **□**  Test : double inscription même nullifier → revert (anti-Sybil)  *\[MVP\]*

* **□**  Test : callback CRE avec mauvais caller → revert  *\[MVP\]*

* **□**  Test : revealTrack par le bon artiste → succès  *\[IMP\]*

* **□**  Test : revealTrack par un tiers → revert  *\[IMP\]*

**4\. Déploiement**

* **□**  Deploy contrat Registry sur Base Sepolia  *\[MVP\]*

* **□**  Vérifier le contrat sur Basescan (sourcify ou \--verify)  *\[MVP\]*

* **□**  Partager l’adresse du contrat \+ ABI avec Marius et Nohem  *\[MVP\]*

* **□**  Tester un appel manuel registerTrack via cast ou Basescan  *\[MVP\]*

**5\. Unlink (intégration contrat)**

* **□**  Identifier l’adresse du pool Unlink sur Base Sepolia  *\[IMP\]*

* **□**  Ajouter listener événement PaymentConfirmed(trackId) du contrat Unlink  *\[IMP\]*

* **□**  Conditionner le SEAL final à la réception de cet événement  *\[IMP\]*

  **NOHEM MONNET-GANI**

  *CRE Workflow & Agents IA  —  Echo  —  ETH Global New York 2026*

| □ MVP — indispensable pour la démo hackathon | □ IMP — important pour les prix sponsors | □ BONUS — nice-to-have si temps disponible |
| :---- | :---- | :---- |

| Dépend de | GAGEXCM — endpoints backend (/convert, /compare/private, /check/public, /compare/commercial, /report)Cyriac — adresse contrat Registry \+ ABI pour le callback on-chainChainlink — accès sandbox Confidential AI \+ credentials CRE |
| :---- | :---- |

**1\. Setup CRE**

* **□**  Init projet CRE SDK TypeScript  *\[MVP\]*

* **□**  Configurer credentials Chainlink CRE (clés, network)  *\[MVP\]*

* **□**  Vérifier accès sandbox Chainlink Confidential AI  *\[MVP\]*

* **□**  Installer CRE CLI et tester hello-world workflow  *\[MVP\]*

**2\. Workflow DAG — Structure**

* **□**  Définir le DAG complet du workflow en CRE SDK (4 steps)  *\[MVP\]*

* **□**  Step 1 : appel BasicPitch via endpoint GAGEXCM (/api/convert)  *\[MVP\]*

* **□**  Step 2A : appel ACRCloud via endpoint GAGEXCM (/api/check/public) — branch parallèle  *\[MVP\]*

* **□**  Step 2B : appel comparaison MIDI privé via endpoint GAGEXCM (/api/compare/private) — branch parallèle  *\[MVP\]*

* **□**  Implémenter la parallélisation 2A ∥ 2B (Promise.all ou équivalent CRE)  *\[MVP\]*

* **□**  Step 3 : conditionnel — ne se déclenche que si 2A retourne matches non vides  *\[MVP\]*

* **□**  Step 3 : appel comparaison MIDI commercial via endpoint GAGEXCM (/api/compare/commercial)  *\[MVP\]*

* **□**  Synchronisation : Step 4 attend 2B ET 3 avant de démarrer  *\[MVP\]*

* **□**  Step 4 : appel rapport final via endpoint GAGEXCM (/api/report)  *\[MVP\]*

**3\. Logique Fail-Fast**

* **□**  Step 2A : si score confiance ≥95 % → halt workflow \+ retourner REJECTED  *\[MVP\]*

* **□**  Step 2B : si similarity\_score ≥75 % → halt workflow \+ retourner SIMILAR  *\[MVP\]*

* **□**  Chaque step : si erreur HTTP ou timeout → halt workflow \+ retourner ERROR  *\[MVP\]*

* **□**  Aucun état partiel écrit on-chain en cas de halt  *\[MVP\]*

**4\. Chainlink Confidential AI**

* **□**  Intégrer les appels aux agents sensibles via Confidential AI API  *\[IMP\]*

* **□**  Soumettre au moins 1 requête d’inférence confidentielle dans le sandbox  *\[IMP\]*

* **□**  Vérifier que l’attestation est bien attachée à la réponse de l’agent  *\[IMP\]*

* **□**  Passer l’attestation dans le callback on-chain (pour vérification par le contrat)  *\[IMP\]*

**5\. Callback On-Chain**

* **□**  Implémenter le callback CRE vers le contrat Registry (Cyriac)  *\[MVP\]*

* **□**  Envoyer : verdict (CLEAN/SIMILAR/REJECTED), commitmentHash, attestation  *\[MVP\]*

* **□**  Tester le callback sur Base Sepolia (transaction visible sur Basescan)  *\[MVP\]*

**6\. Simulation & Déploiement CRE**

* **□**  Simuler le workflow complet via CRE CLI  *\[MVP\]*

* **□**  Corriger les erreurs de simulation (types, dépendances)  *\[MVP\]*

* **□**  Documenter l’output de simulation pour la soumission du projet  *\[MVP\]*

* **□**  Demander le déploiement live à l’équipe Chainlink hackathon  *\[IMP\]*

  **GAGEXCM**

  *Backend, Pipeline & Intégrations  —  Echo  —  ETH Global New York 2026*

| □ MVP — indispensable pour la démo hackathon | □ IMP — important pour les prix sponsors | □ BONUS — nice-to-have si temps disponible |
| :---- | :---- | :---- |

| Dépend de | Nohem — format exact des requêtes CRE vers chaque endpointCyriac — adresse contrat Registry (pour ancrage blob IDs Walrus)Marius — format attendu des réponses API (rapport, statuts) |
| :---- | :---- |

**1\. Setup Backend**

* **□**  Init API backend (Next.js API routes ou serveur Express)  *\[MVP\]*

* **□**  Variables d’environnement : ACRCloud key, Spotify client ID/secret, Walrus endpoint, Unlink SDK  *\[MVP\]*

* **□**  Setup Python env pour BasicPitch (ou wrapper via child\_process)  *\[MVP\]*

**2\. Step 1 — BasicPitch (Conversion Audio → MIDI)**

* **□**  Intégrer BasicPitch : recevoir audio brut → retourner fichier MIDI  *\[MVP\]*

* **□**  Endpoint POST /api/convert { audioFile } → { midiSequence }  *\[MVP\]*

* **□**  Stocker le MIDI temporairement pour les steps suivants  *\[MVP\]*

**3\. Step 2A — ACRCloud (Fingerprint Public)**

* **□**  Intégrer ACRCloud API : envoyer audio brut → récupérer matches  *\[MVP\]*

* **□**  Endpoint POST /api/check/public { audioFile } → { matches: \[{ISRC, confidence\_score}\] }  *\[MVP\]*

* **□**  Filtrer : ne retourner que les matches avec confidence\_score ≥50 %  *\[MVP\]*

**4\. Step 2B — Comparaison MIDI vs Registre Privé**

* **□**  Implémenter algo de comparaison de séquences MIDI (cosinus sur embeddings)  *\[MVP\]*

* **□**  Charger les entrées MIDI du registre privé depuis Walrus  *\[MVP\]*

* **□**  Endpoint POST /api/compare/private { midiSequence } → { registry\_matches: \[{track\_id, similarity\_score}\] }  *\[MVP\]*

**5\. Step 3 — Comparaison MIDI vs Tracks ACRCloud**

* **□**  Intégrer Spotify API : ISRC → access token OAuth2 → preview URL 30s  *\[MVP\]*

* **□**  Télécharger preview audio 30s depuis Spotify  *\[MVP\]*

* **□**  Passer le preview dans BasicPitch → MIDI commercial  *\[MVP\]*

* **□**  Lancer algo comparaison MIDI : notre MIDI vs MIDI commercial  *\[MVP\]*

* **□**  Endpoint POST /api/compare/commercial { midiSequence, ISRCs\[\] } → { commercial\_deltas: \[{ISRC, melodic, rhythmic, structural}\] }  *\[MVP\]*

**6\. Step 4 — Extraction Acoustique \+ Rapport Final**

* **□**  Implémenter extraction clé, mode, BPM depuis audio brut (librosa ou Essentia)  *\[MVP\]*

* **□**  Intégrer Spotify Audio Analysis API : récupérer clé \+ BPM pour les tracks commerciales via ISRC  *\[IMP\]*

* **□**  Agréger registry\_matches (2B) \+ commercial\_deltas (3) en une liste classée par score global  *\[MVP\]*

* **□**  Générer ai\_summary : commentaire synthétique sur les similarités trouvées  *\[IMP\]*

* **□**  Endpoint POST /api/report { audioFile, midiSequence, registry\_matches, commercial\_deltas } → { verdict, submitted\_track, similar\_tracks\[\], ai\_summary }  *\[MVP\]*

**7\. Walrus — Stockage Décentralisé**

* **□**  Setup SDK Walrus (Sui) et wallet de stockage  *\[IMP\]*

* **□**  Upload audio chiffré (clé client-side) → récupérer blob ID  *\[IMP\]*

* **□**  Upload métadonnées (profil MIDI, scores, rapport) → blob IDs  *\[IMP\]*

* **□**  Endpoint POST /api/storage/upload { audioFile, metadata } → { blobIds\[\] }  *\[IMP\]*

* **□**  Endpoint GET /api/storage/:blobId → contenu déchiffré (artiste authentifié seulement)  *\[IMP\]*

* **□**  Ancrer les blob IDs dans l’appel registerTrack (passé au contrat via Marius/Nohem)  *\[IMP\]*

**8\. Unlink — Paiements Privés**

* **□**  Installer @unlink-xyz/sdk et configurer le pool privé Base Sepolia  *\[IMP\]*

* **□**  Router les paiements x402 des agents (Steps 2A, 2B, 3, 4\) via Unlink deposit/transfer  *\[IMP\]*

* **□**  Vérifier que les montants sont invisibles on-chain depuis l’extérieur  *\[IMP\]*

* **□**  Intégrer SoundCloud API : upload audio \+ metadata via endpoint privé  *\[BONUS\]*

* **□**  Router l’upload SoundCloud via Unlink (transmission audio privée)  *\[BONUS\]*

**9\. Documentation & Repo**

* **□**  README.md : décrire tous les endpoints, formats de requête/réponse  *\[MVP\]*

* **□**  Documenter l’intégration Unlink : ce qui est désormais privé vs avant  *\[IMP\]*

* **□**  Spécifier la dépendance Walrus : quel contenu va où et pourquoi  *\[IMP\]*

