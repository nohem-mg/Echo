  
**THE LOOP PROTOCOL**

Registre Open Source de Prior-Art Musical

**ETH Global New York 2026**

Documentation Technique du Projet  —  v2

| World ID | Chainlink CRE | Unlink | Walrus / Sui |
| :---: | :---: | :---: | :---: |

CNM Agency  —  Juin 2026

# **1\. Résumé Exécutif**

The Loop Protocol est un registre de prior-art musical on-chain conçu pour les artistes indépendants qui ont besoin d'une preuve d'antériorité horodatée, vérifiable — et confidentielle — sans jamais exposer leur musique non encore sortie.

**Idée centrale :** Avec l'essor de la musique générée par IA et les procès emblématiques (Suno, Udio), les artistes ont besoin d'un moyen trustless, vérifiable et privé d'affirmer "j'ai créé ça en premier". The Loop Protocol le rend possible en combinant empreinte IA multi-agents, environnements d'exécution de confiance (TEE) et horodatage on-chain dans un pipeline agentique parallélisé en 5 phases.

| Problème | Aucun moyen trustless, privé et vérifiable de revendiquer l'antériorité musicale avant la sortie d'un morceau. |
| :---: | :---- |
| **Solution** | Pipeline agentique 5-phases avec parallélisation : Shazam check \+ analyse acoustique en parallèle, comparaison registre privé \+ comparaison commerciale en parallèle, synthèse finale avec liste de tracks similaires, engagement on-chain. |
| **Cible** | Artistes indés, labels, avocats spécialisés musique, et plateformes IA ayant besoin d'une traçabilité IP prouvable. |
| **Objectif prix** | 20 500 $ répartis sur les tracks World, Chainlink et Unlink. |

# **2\. Énoncé du Problème**

L'industrie musicale est confrontée à une crise de la propriété intellectuelle portée par deux forces convergentes :

* **La musique générée par IA** (Suno, Udio, Stable Audio) peut produire à grande échelle des mélodies, progressions et timbres quasi-identiques, rendant presque impossible de prouver qui a composé quelque chose en premier.

* **Il n'existe aucun registre neutre de prior-art** pour les musiciens indépendants. L'enregistrement de droits d'auteur (SACEM, US Copyright Office, etc.) est lent, centralisé et exige une divulgation publique — rédhibitoire pour une track non sortie.

* **Les plateformes de streaming et les réseaux sociaux** n'offrent aucune protection IP. Mettre un morceau sur SoundCloud ou YouTube ne constitue pas une preuve d'antériorité légale opposable.

* **La confidentialité est primordiale :** un artiste ne peut pas divulguer publiquement une track avant sa sortie commerciale sans en détruire la valeur marchande.

## **2.1 Le Manque**

Ce dont les artistes ont besoin est un système satisfaisant simultanément quatre propriétés :

* **Trustless :** aucun intermédiaire ne peut forger, altérer ou supprimer l'enregistrement.

* **Vérifiable :** tout tiers (juge, label, avocat) peut confirmer indépendamment le timestamp et l'empreinte.

* **Confidentiel :** l'audio réel reste privé jusqu'à ce que l'artiste choisisse de le révéler.

* **Résistant au Sybil :** un humain \= une preuve de création, empêchant le spam du registre par des bots ou des labels concurrents.

Aucune solution existante — que ce soit l'US Copyright Office, la SACEM, ou tout projet blockchain — ne satisfait les quatre propriétés simultanément. The Loop Protocol, si.

# **3\. Pipeline Agentique : Séquence & Parallélisation**

Le cœur de The Loop Protocol est un **pipeline DAG (Directed Acyclic Graph) en 4 étapes** conçu pour maximiser la parallélisation agentique tout en garantissant un schéma fail-fast strict. Les étapes 2A et 2B s’exécutent en parallèle ; l’étape 3 démarre dès que 2A est terminée sans attendre 2B ; l’étape 4 attend que 2B ET 3 soient toutes les deux complètes.

## **3.1 Vue d’Ensemble du DAG**

| STEP 1 | Conversion Audio → MIDI — *Séquentiel — Prérequis de tous les steps suivants* Outil : BasicPitch (Spotify Research). Convertit l’audio brut en séquence MIDI. C’est un outil de conversion uniquement, pas un agent d’analyse. |
| :---: | :---- |
| **STEP 2** | **Double Comparaison — PARALLÈLE : 2A ∥ 2B** **2A :** ACRCloud compare l’empreinte acoustique (pics spectro-temporels) de l’audio soumis contre sa base publique de millions de tracks commerciales. Retourne les ISRC des sons acoustiquement similaires avec un score de confiance. **2B :** Algorithme de comparaison de séquences MIDI compare le MIDI (Step 1\) contre notre base privée du registre (sons stockés en format MIDI). Retourne les tracks similaires avec un score de similarité compositionnelle. |
| **STEP 3** | **Comparaison MIDI vs Résultats ACRCloud —** *Séquentiel, démarre dès que 2A est fini (n’attend pas 2B)* Via l’ISRC retourné par ACRCloud, on récupère le preview audio de chaque track similaire (Spotify API) et on le convertit en MIDI via BasicPitch. L’algorithme de comparaison de séquences MIDI tourne ensuite entre notre MIDI (Step 1\) et ces MIDIs commerciaux — détectant la similarité compositionnelle au-delà de la ressemblance acoustique. |
| **STEP 4** | **Extraction Acoustique \+ Rapport Final —** *Séquentiel, attend 2B ET 3* Extrait la clé, le BPM et l’empreinte acoustique depuis l’**audio brut** (pas le MIDI — ces features s’extraient du signal audio). Fait de même pour tous les sons similaires trouvés en 2B \+ 3 (via Spotify Audio Analysis pour les tracks commerciales). Produit le rapport final avec liste classée. |

## **3.2 Diagramme de Dépendances (DAG)**

**Légende :** *∥ \= parallélisation  │  → \= dépendance séquentielle  │  \[STOP\] \= fail-fast*

| STEP 1  BasicPitch ─ Conversion audio → MIDI ─────────────────────  \[STOP si échec\]               | STEP 2  ┌────────────────────────┐         │ 2A : ACRCloud                │ 2B : Algo comparaison MIDI         │ Fingerprint vs base publique │ MIDI vs base privée du registre         │ → ISRC \+ score confiance     │ → tracks similaires \+ score %         │ \[≥95 % → STOP plagiat\]      │ \[≥75 % → STOP SIMILAR\]               |                              | STEP 3  ISRC → Spotify API → preview audio → BasicPitch → MIDI         Algo comparaison MIDI : notre MIDI vs MIDIs commerciaux     |               └──────────────────────────────┘ STEP 4  Extraction clé \+ BPM \+ empreinte (audio brut) → Rapport final classé |
| :---- |

## **3.3 Détail de Chaque Étape**

### **Step 1 — Conversion Audio → MIDI (Séquentiel)**

| Composant | Action | Sortie |
| ----- | ----- | ----- |
| **BasicPitch(Spotify Research)** | Reçoit l’audio brut (WAV/MP3). Convertit en séquence de notes MIDI. **C’est un outil de conversion uniquement. Il ne fait aucune analyse musicale.** La comparaison des séquences MIDI est faite par un algorithme séparé (Steps 2B et 3). | midi\_sequence (fichier)Bloque 2A et 2B |

### **Step 2 — Double Comparaison en Parallèle : 2A ∥ 2B**

|  | Outil | Mécanisme & Actions | Sortie / Condition d’échec |
| :---: | ----- | ----- | ----- |
| **2A** | **ACRCloud(base publique)** | **Mécanisme :** ACRCloud extrait un fingerprint acoustique de l’audio soumis (ensemble de pics spectro-temporels issus du spectrogramme). Ce fingerprint est comparé par lookup rapide contre les fingerprints pré-calculés de millions de tracks commerciales dans sa base publique. La similarité est mesurée par le nombre de landmarks temps-fréquence qui coïncident. **Ce que ça détecte :** similarité acoustique / timbrale (même enregistrement, même couleur sonore, sample, copie). **Ce que ça ne détecte pas :** similarité compositionnelle entre deux enregistrements différents — c’est pourquoi Step 3 existe. **Actions :** 1\. Extraire fingerprint de l’audio soumis. 2\. Lookup dans la base publique. 3\. Retourner matches avec score de confiance et ISRC. Si ≥95 % → STOP immédiat. | matches\[\] → { ISRC, score\_confiance }Score confiance \= % de landmarks qui coïncident≥95 % → STOP (copie évidente)50–94 % → passe à Step 3\< 50 % → Step 3 ignoré |
| **2B** | **Algo comparaison MIDI(base privée)** | **Mécanisme :** Algorithme de comparaison de séquences MIDI (similarité cosinus sur embeddings MIDI). Compare note par note la séquence MIDI produite par BasicPitch contre toutes les entrées de notre registre privé (stockées en format MIDI sur Walrus). **Ce que ça détecte :** similarité compositionnelle réelle (même mélodie, même harmonie, même structure — indépendamment du style de production). Retourne un vrai % de similarité musicale. **Note :** Algorithme distinct de BasicPitch. BasicPitch convertit. Cet algorithme compare. | registry\_matches\[\] → { track\_id, timestamp, similarity\_score }Similarity\_score \= vrai % de similarité musicale≥75 % → STOP (SIMILAR)\< 75 % → passe à Step 4 |

**Note implémentation :** 2A reçoit l’audio brut. 2B reçoit le MIDI de Step 1\. Aucune dépendance entre eux. Le CRE les déclenche simultanément.

### **Step 3 — Comparaison MIDI vs Résultats ACRCloud (Séquentiel après 2A)**

| Outil | Mécanisme & Actions | Sortie |
| ----- | ----- | ----- |
| **Spotify API+BasicPitch+Algo comparaison MIDI** | **Pourquoi ce step existe :** ACRCloud détecte la similarité acoustique mais pas compositionnelle. Les tracks qu’il retourne sont les meilleures candidates au plagiat compositionnel. On va donc comparer nos MIDI contre les leurs. **1\.** Via l’ISRC retourné par 2A, interroger l’API Spotify pour récupérer le preview audio 30s de chaque track similaire. **2\.** Passer ces previews dans BasicPitch pour obtenir leurs séquences MIDI. **3\.** Lancer l’algorithme de comparaison MIDI entre notre séquence (Step 1\) et chacun de ces MIDIs commerciaux. Retourne un vrai % de similarité compositionnelle. | commercial\_deltas\[\] → { ISRC, melodic\_similarity, rhythmic\_similarity, structural\_similarity }Tous en vrais % de similarité musicaleBloque Step 4 |

**Note implémentation :** Step 3 démarre dès que 2A est terminé, sans attendre 2B. Step 4 attend la fin de 2B ET de 3\.

### **Step 4 — Extraction Acoustique \+ Rapport Final (attend 2B \+ 3\)**

| Outil | Actions | Sortie |
| ----- | ----- | ----- |
| **Algo d’analyse acoustique+Spotify Audio Analysis(pour les tracks commerciales)** | **Inputs :** audio brut (obligatoire pour l’extraction), midi\_sequence (contexte mélodique), registry\_matches\[\] de 2B, commercial\_deltas\[\] de 3\. **Pourquoi l’audio brut et pas le MIDI :** la clé, le BPM et l’empreinte acoustique s’extraient depuis le signal audio. Le MIDI ne contient pas ces informations acoustiques. **1\.** Extraire clé, mode, BPM, empreinte acoustique de la track soumise (depuis l’audio brut). **2\.** Extraire les mêmes features pour les tracks similaires trouvées en 2B \+ 3\. Pour les tracks commerciales : via Spotify Audio Analysis (déjà calculé, pas besoin de les recalculer). **3\.** Agréger tous les résultats en un rapport final avec liste classée de tracks similaires. | final\_report → {  verdict: CLEAN | SIMILAR,  submitted\_track: { key, mode, BPM, fingerprint },  similar\_tracks: \[    { rank, title, source, score, melody, rhythm, structure, key, BPM }  \],  ai\_summary: string}SIMILAR → rapport à l’artisteCLEAN → engagement on-chain |

## **3.4 Format du Rapport de Comparaison Final**

Le rapport produit par Step 4 est rendu dans l’interface artiste sous forme de tableau interactif :

| Rang | Titre — Artiste | Score global | Mélodie | Rythme | Structure | Clé / BPM | Source |
| :---: | ----- | :---: | :---: | :---: | :---: | :---: | ----- |
| **1** | Blinding Lights — The Weeknd | **68 %** | 72 % | 81 % | 55 % | La min / 171 | ACRCloud |
| **2** | @artist\_xyz — \[SEALED\] | **61 %** | 65 % | 58 % | 62 % | Sol maj / 124 | Registre privé |
| **3** | As It Was — Harry Styles | **44 %** | 38 % | 61 % | 40 % | La min / 174 | ACRCloud |

**Règle de verdict :** Score global du meilleur match \< 75 % → verdict CLEAN, procédure SEAL. Score ≥75 % → verdict SIMILAR, rapport affiché à l’artiste, aucune écriture on-chain.

## **3.5 Intégration SoundCloud via Unlink**

Après un enregistrement SEALED réussi, l’artiste peut optionnellement publier son morceau sur SoundCloud via l’API SoundCloud. Ce flux est entièrement routé par Unlink : transit audio privé, paiement non-traçable, et lien entre inscription Loop Protocol et publication SoundCloud inobservable on-chain.

## **3.6 Clearance API (Monétisation)**

Les applications externes peuvent interroger le registre via la Clearance API. Chaque requête coûte un micro-paiement x402 : vérification IP avant upload pour les plateformes de streaming, contrôle de dataset pour les entreprises IA, rapport certifié pour les avocats IP.

# **4\. Récapitulatif des Outils & Agents**

Le pipeline mobilise un outil de conversion et trois agents de comparaison/analyse. La distinction entre outil de conversion et algorithme de comparaison est fondamentale : BasicPitch transforme, il n’analyse pas.

| Step | Outil / Agent | Type | Rôle | Source comparée | Sortie |
| :---: | ----- | :---: | ----- | :---: | ----- |
| **1** | **BasicPitch** | Conversion | Convertit audio brut en séquence MIDI. Outil de transformation uniquement, pas d’analyse. | — | midi\_sequence |
| **2A** | **ACRCloud** | Fingerprintlookup | Fingerprint acoustique (pics spectro-temporels) de l’audio soumis comparé contre base publique. Détecte similarité acoustique/timbrale. | Base publiqueACRCloud | ISRC \+ score de confiance |
| **2B** | **Algo comparaison MIDI** | Similaritécompositionnelle | Comparaison cosinus sur embeddings MIDI entre la séquence soumise et les entrées du registre privé. Détecte similarité musicale réelle. | Registre privé(MIDI, Walrus) | similarity\_score (%) |
| **3** | **Spotify API+BasicPitch+Algo MIDI** | Similaritécompositionnelle | ISRC (ACRCloud) → Spotify preview 30s → BasicPitch → MIDI commercial. Puis comparaison MIDI soumis vs MIDIs commerciaux. | Tracks ACRCloud(via Spotify) | melodic, rhythmic,structural similarity (%) |
| **4** | **Algo analyse acoustique+Spotify Audio Analysis** | Extraction+ Synthèse | Extrait clé, BPM, empreinte depuis l’audio brut. Spotify Audio Analysis pour les tracks commerciales (pré-calculé). Produit le rapport final classé. | Audio brut+ résultats 2B \+ 3 | Rapport finalCLEAN | SIMILAR |

## **4.1 Deux Concepts Distincts à Ne Pas Confondre**

| Concept | BasicPitch | Algo de comparaison MIDI |
| ----- | ----- | ----- |
| **Rôle** | Convertir audio en notes MIDI | Comparer deux séquences MIDI |
| **Input** | Fichier audio (WAV/MP3) | Deux fichiers MIDI |
| **Output** | Séquence MIDI (notes, durées, vélocités) | Score de similarité (0–100 %) |
| **Utilisé dans** | Step 1 (track soumise) \+ Step 3 (previews commerciaux) | Step 2B (vs registre privé) \+ Step 3 (vs commercial) |

## **4.2 Confidential AI — Pourquoi les TEE ?**

Chainlink Confidential AI fournit un isolement matériel (Intel TDX) pour les agents opérant sur des données sensibles. Trois garanties :

* **Confidentialité des entrées :** l’audio brut et les MIDIs ne quittent jamais l’enclave.

* **Intégrité des sorties :** les scores et le rapport final portent une attestation cryptographique vérifiable on-chain.

* **Sécurité pré-release :** une track non sortie peut être analysée sans aucun risque de fuite audio.

# **5\. Stack Technique**

| Couche | Technologie | Rôle dans The Loop Protocol |
| ----- | ----- | ----- |
| **Identité humaine** | **World ID \+ AgentKit** | Prouve que chaque artiste est un humain unique et vérifié. AgentKit émet des credentials Human-Backed Agent qui conditionnent l'entrée dans le pipeline et la mécanique de free-trial. |
| **Orchestration** | **Chainlink CRE** | Moteur de workflow DAG 5-phases. Gère la parallélisation A∥B et C∥D, les synchronisations inter-phases, et l'écriture finale du verdict on-chain via callback. |
| **IA Confidentielle** | **Chainlink Confidential AI** | Exécute les agents A, B, C, D dans des TEE. Produit des attestations cryptographiques vérifiables on-chain. |
| **Détection commerciale** | **ACRCloud** | Agent A : Shazam check commercial en Phase 1\. Empreinte acoustique contre la base mondiale de titres connus. |
| **Conversion MIDI** | **BasicPitch (Spotify)** | Agent B : conversion audio → MIDI \+ extraction BPM, clé, empreinte, accords, structure. |
| **Couche Privacy** | **Unlink SDK** | Route tous les paiements agents (x402) et la transmission SoundCloud via des balances privées. Empêche toute analyse du graphe de paiement. |
| **Stockage** | **Walrus (Sui)** | Stockage décentralisé des audios chiffrés, profils MIDI, scores de similarité, hashes d'engagement. Blobs adressés par contenu, inviolables. |
| **Blockchain** | **Base Sepolia** | Héberge le contrat World Router, le contrat Registry et toutes les interactions avec le pool blindé Unlink. |
| **Wallet / Auth** | **MetaMask / World App (wagmi)** | Signature des transactions côté artiste. World App interface principale pour World ID. |
| **Paiements** | **Protocole x402** | Micro-paiements HTTP machine-to-machine pour les 5 agents et les requêtes Clearance API. Tous les flux x402 passent par Unlink. |

## **5.1 Architecture de Stockage Walrus**

Walrus (construit sur Sui) fournit deux niveaux de stockage pour The Loop Protocol :

* **Blobs audio :** Le fichier audio original est chiffré côté client avant upload. Seul l'artiste détient la clé de déchiffrement jusqu'au REVEAL.

* **Blobs de métadonnées :** Profil JSON Agent B, scores de similarité C \+ D, rapport Agent E, hashes d'engagement, timestamps SEAL/REVEAL — tous stockés en blobs Walrus distincts et immuables.

* **Preuve d'inviolabilité :** Le stockage à codage d'effacement de Walrus garantit que toute altération est immédiatement détectable.

# **6\. Stratégie de Candidature aux Prix**

The Loop Protocol cible 20 500 $ répartis sur cinq tracks de prix auprès de trois sponsors.

## **6.1  World — Track A (AgentKit)  |  7 500 $**

| Dotation | 3 500 $ (1er) / 2 500 $ (2e) / 1 500 $ (3e) |
| :---- | :---- |
| **Exigence** | Utilisation significative d'AgentKit \+ mécanique free-trial conditionnée par des humains vérifiés \+ Human-Backed Agents opérationnels |
| **Notre implémentation** | AgentKit émet des credentials Human-Backed Agent en Phase 0\. Les cinq agents IA héritent de ce credential, garantissant que seules les inscriptions initialisées par des humains aboutissent. Mécanique de trial : les 3 premières inscriptions par World ID sont gratuites. Après le trial, les micro-paiements x402 s'activent. |

## **6.2  World — Track B (World ID)  |  2 500 $**

| Dotation | 1 500 $ (1er) / 1 000 $ (2e) |
| :---- | :---- |
| **Exigence** | Le produit casse sans World ID \+ preuve validée on-chain |
| **Pourquoi on est éligibles** | Sans World ID, n'importe quel script peut spammer le registre avec des milliers de fausses revendications. World ID impose une-humain-une-inscription. Validation on-chain via le contrat World Router sur Base Sepolia. |

## **6.3  Chainlink — Meilleur Workflow CRE  |  6 000 $**

| Dotation | Jusqu'à 3 équipes x 2 000 $ |
| :---- | :---- |
| **Exigence** | Workflow CRE comme couche d'orchestration \+ \>= 1 blockchain \+ API/LLM/agent \+ simulation réussie |
| **Notre implémentation** | Le CRE est l'orchestrateur central du DAG 5-phases. Il gère la parallélisation A∥B (Phase 1), la synchronisation inter-phases, la parallélisation C∥D (Phase 2), et l'écriture finale on-chain. Blockchain \+ 5 appels API/agents IA dans un seul workflow. *Simulation via CRE CLI \+ déploiement live demandé à l'équipe Chainlink pendant le hackathon.* |

## **6.4  Chainlink — Confidential AI Attester  |  4 000 $**

| Dotation | Jusqu'à 2 équipes x 2 000 $ |
| :---- | :---- |
| **Exigence** | Utiliser les APIs Chainlink Confidential AI, soumettre \>= 1 requête confidentielle, traiter des entrées sensibles |
| **Notre implémentation** | Quatre agents (A, B, C, D) soumettent des requêtes d'inférence confidentielle. Les entrées sensibles sont : MIDI d'une track non sortie, profil complet, comparaison vs registre privé, comparaison vs commercial. Les attestations sont vérifiées par le contrat Registry. |

## **6.5  Unlink — Meilleure Intégration dans une App OSS  |  2 500 $**

| Dotation | 2 500 $ |
| :---- | :---- |
| **Exigence** | Intégrer @unlink-xyz/sdk dans une vraie app OSS, router les flux existants via Unlink, démo fonctionnelle \+ repo public |
| **Notre implémentation** | Deux points d'intégration Unlink : (1) pipeline de paiements x402 pour les 5 agents (tous les flux machine-to-machine passent par des balances privées Unlink), et (2) client API SoundCloud OSS (upload audio \+ paiement routés par Unlink, rendant la distribution non-traçable depuis l'inscription on-chain). |

## **6.6  Récapitulatif des Prix**

| Track de Prix | Montant Max | Placement Ciblé |
| ----- | :---: | ----- |
| World — Track A (AgentKit) | **7 500 $** | 1re place (3 500 $) |
| World — Track B (World ID) | **2 500 $** | 1re place (1 500 $) |
| Chainlink — Meilleur Workflow CRE | **6 000 $** | 1 slot à 2 000 $ |
| Chainlink — Confidential AI Attester | **4 000 $** | 1 slot à 2 000 $ |
| Unlink — Meilleure Intégration OSS | **2 500 $** | 1re place (2 500 $) |
| **TOTAL CIBLE** | **20 500 $** | Estimation conservatrice (paliers minimaux) |

# **7\. Architecture des Smart Contracts**

## **7.1 Contrat Registry (Base Sepolia)**

Le contrat Registry est la source de vérité unique pour toutes les revendications de prior-art. Il stocke :

* **commitmentHash :** keccak256(empreinte \+ profil JSON) — scellé à l'inscription.

* **worldNullifier :** hash nullificateur World ID garantissant une inscription par humain par track.

* **timestamp :** block.timestamp à l'inscription — la date de prior-art légalement significative.

* **status :** SEALED | REVEALED | SIMILAR | REJECTED.

* **walrusBlobIds :** références vers l'audio et les métadonnées stockés sur Walrus.

## **7.2 Intégration World Router**

Le contrat Registry appelle le World Router pour valider la preuve World ID avant toute opération d'écriture. Sans preuve valide, registerTrack() revient en erreur.

## **7.3 Flux CRE → Écriture Contrat**

Chainlink CRE agit comme un exécuteur off-chain de confiance. Une fois le DAG 5-phases complété avec succès, le callback on-chain du CRE écrit l'engagement et le statut dans le contrat Registry en une seule transaction atomique. Le callback porte l'attestation Confidential AI, vérifiée par le contrat avant acceptation.

## **7.4 Cycle de Vie SEALED → REVEALED**

* **SEALED :** hash on-chain, timestamp verrouillé, audio et profil confidentiels. Utilisable dans tout litige juridique.

* **REVEALED :** l'artiste déclenche une transaction de révélation à la sortie. Le profil complet est publié, liant le hash SEALED à l'audio réel.

# **8\. Différenciation Concurrentielle**

| Propriété | US Copyright Office | SACEM / OGC | Timestamp NFT | The Loop Protocol |
| ----- | :---: | :---: | :---: | :---: |
| **Trustless** | ✗ | ✗ | \~ | ✓ |
| **Confidentiel (pré-release)** | ✗ | ✗ | ✗ | ✓ |
| **Résistant au Sybil** | \~ | \~ | ✗ | ✓ |
| **Vérif. similarité IA multi-agents** | ✗ | ✗ | ✗ | ✓ |
| **Comparaison registre \+ commercial** | ✗ | ✗ | ✗ | ✓ |
| **Rapport final avec liste tracks** | ✗ | ✗ | ✗ | ✓ |
| **Instantané (\< 75 s)** | ✗ | ✗ | ✓ | ✓ |
| **Stockage décentralisé** | ✗ | ✗ | \~ | ✓ |

# **9\. Livrables du Hackathon & Roadmap**

## **9.1 Livrables pour ETH Global New York**

1. **Intégration World ID** — Contrat World Router sur Base Sepolia, émission de credentials AgentKit, mécanique de free-trial (3 inscriptions gratuites par humain).

2. **Workflow CRE DAG 5-phases** — Parallélisation A∥B (Phase 1\) et C∥D (Phase 2). Simulé via CRE CLI, déploiement live demandé à Chainlink.

3. **4 agents Chainlink Confidential AI** — Agents A, B, C, D dans TEE. Attestations vérifiées par le contrat Registry.

4. **Intégration Unlink SDK** — Paiements x402 des 5 agents \+ upload SoundCloud routés via balances privées Unlink.

5. **Stockage Walrus** — Blobs audio et métadonnées sur Walrus (Sui), identifiants ancrés dans le contrat Registry.

6. **Rapport de comparaison final** — Agent E : liste classée de N tracks similaires avec scores multidimensionnels et commentaire IA.

7. **Démo front-end** — Interface Next.js / wagmi : upload track, vérification World App, réception certificat SEALED \+ rapport de comparaison.

8. **Repo public \+ README** — Documentation complète des intégrations, projets OSS upstream, et ce qui est désormais privé.

## **9.2 Vision Post-Hackathon**

* Déploiement mainnet sur Base avec de vrais paiements USDC via x402.

* Clearance API ouverte aux plateformes de streaming pour des vérifications IP avant upload.

* Partenariat juridique avec des cabinets spécialisés IP pour des exports de timestamp certifiés.

* Support de blockchains additionnelles via Chainlink CCIP.

* Application mobile artiste (World App Mini App) pour une inscription en un geste depuis mobile.

# **10\. Équipe — CNM Agency**

CNM Agency (SIRET 994 828 358 00014\) est une micro-entreprise française de développement web & Web3. L'équipe a participé à plusieurs hackathons ETHGlobal, dont ETHGlobal Cannes 2026 (Yield Stream Marketplace) et ETHGlobal Open Agents 2026 (Onchor.ai — finaliste Round 2, top 40 sur 468 projets).

| Fondateur | Focus à ETH Global New York |
| ----- | ----- |
| **Cyriac Mirkovik** | Développement smart contracts — Registry, World Router, callback CRE. |
| **Nohem Monnet-Gani** | Authoring du workflow CRE DAG (SDK TypeScript), parallélisation A∥B et C∥D, agents Chainlink Confidential AI. |
| **Marius Gal** | Front-end (Next.js \+ wagmi), World App Mini App, UI rapport de comparaison, UX de démo. |
| **GAGEXCM** | Lead architecture, design du pipeline DAG, intégration Unlink SDK, stockage Walrus, pipeline ACRCloud \+ BasicPitch, pitch & documentation. |

## **Expérience ETHGlobal Précédente**

* **Onchor.ai (Open Agents 2026\) :** Copilote d'audit de sécurité Solidity avec mémoire collective persistante — Finaliste Round 2 (top 40/468). Stack : Claude Sonnet, 0G Storage, KeeperHub MCP, ENS subnames, x402 USDC sur Base Sepolia.

* **Yield Stream Marketplace (Cannes 2026\) :** Protocole DeFi tokenisant les revenus de frais de protocole sous forme de tokens ERC-20 YST. Cinq contrats Sepolia déployés. Chainlink CRE, ENS, Arc cross-chain USDC, Uniswap v4.

