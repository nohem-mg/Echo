# basic-pitch-service (Echo — Step 1)

Microservice de **conversion audio brut → MIDI** via [Spotify BasicPitch](https://github.com/spotify/basic-pitch).
Premier maillon du DAG fail-fast : il **convertit, il n'analyse pas** (clé/BPM/empreinte
viennent de l'audio brut en Step 4 ; la similarité MIDI est un service séparé).

## API

### `POST /convert`
- **Entrée** : `multipart/form-data`, champ `file`.
- **Formats** : `wav` (recommandé, lossless → meilleure transcription), `mp3`, `flac`, `ogg`, `m4a`.
  L'audio est downmixé mono + resamplé à 22 050 Hz par BasicPitch (non configurable, Step 1 = conversion).
- **Bornes** : ≤ 50 MB, ≤ 10 min (configurable). Rejet **avant** inférence.
- **Sortie `200`** :
  ```json
  {
    "midi_sequence": {
      "notes": [{"start_s": 0.51, "end_s": 0.92, "pitch": 60, "velocity": 84, "pitch_bends": null}],
      "duration_s": 184.2,
      "n_notes": 412,
      "tempo_bpm_estimate": null
    },
    "model": {"backend": "coreml", "version": "0.4.0"},
    "request_id": "uuid"
  }
  ```
- **Erreurs** (enveloppe uniforme `{code, message, request_id, details?}`) :

  | Code | `code` | Cas |
  |---|---|---|
  | 415 | `unsupported_media_type` | extension non whitelistée |
  | 413 | `payload_too_large` | fichier > limite |
  | 422 | `invalid_audio` / `validation_error` | audio vide/corrompu, durée hors borne, requête malformée |
  | 500 | `inference_error` | échec modèle → le CRE traite ça comme **STOP fail-fast** |

### `GET /health`
Liveness simple (`{"status": "ok"}`).

## Lancer en local

Toutes les commandes se lancent **depuis ce dossier** (`backend/services/basic-pitch-service`),
et `pip`/`pytest`/`uvicorn` **n'existent que dans le venv** : tant que tu n'as pas fait
`source .venv311/bin/activate`, tu auras `command not found`.

```bash
cd ~/repos/Echo/backend/services/basic-pitch-service

# 1. Créer le venv (Python 3.11 obligatoire — voir note ci-dessous)
/opt/homebrew/opt/python@3.11/bin/python3.11 -m venv .venv311

# 2. L'activer (le prompt affiche alors « (.venv311) » au début)
source .venv311/bin/activate

# 3. Installer le service + ses deps (basic-pitch + runtime ML, ~2-4 min)
pip install -e ".[dev]"

# 4. Lancer le serveur
uvicorn app.main:app --reload --port 8001
```

> **Note** : à chaque nouveau terminal, ré-active le venv (`source .venv311/bin/activate`)
> avant `pytest`/`uvicorn`. Pour quitter le venv : `deactivate`.

## Lancer via Docker (iso-prod, sans venv)

Pas besoin de Python 3.11 ni de venv : l'image épingle déjà tout. Depuis `backend/` :

```bash
docker compose up --build basic-pitch-service   # build + démarre, port 8001 exposé
```

C'est ce point d'orchestration (`backend/docker-compose.yml`) qui accueillera les
prochains services — un bloc par service.

> Image seule, sans compose :
> `docker build -t echo/basic-pitch . && docker run -p 8001:8001 echo/basic-pitch`

## Faire des appels

Quel que soit le mode de lancement (venv ou Docker), l'API écoute sur le port 8001 :

```bash
# Conversion audio -> MIDI (fixtures fournies dans tests/resources/)
curl -F file=@tests/resources/arpeggio.wav http://localhost:8001/convert
curl -F file=@tests/resources/arpeggio.mp3 http://localhost:8001/convert

curl http://localhost:8001/health     # liveness
open http://localhost:8001/docs        # doc interactive OpenAPI / Swagger
```

> **Python 3.11 obligatoire.** basic-pitch 0.4.0 exige `tensorflow-macos<2.15.1` sur
> Darwin py>3.11 (wheels inexistants → 3.12/3.13/3.14 cassés sur Mac), et la stack ML
> ne supporte pas encore 3.13+. Sur Mac, basic-pitch s'installe avec le backend **CoreML**
> (pas de TensorFlow). Le `Dockerfile` épingle 3.11. NB : `setuptools<81` est épinglé car
> `resampy<0.4.3` (transitif) importe `pkg_resources`, retiré de setuptools 81+.

## Tests

Venv activé (cf. ci-dessus) :

```bash
pytest                # 8 tests : 6 unitaires (modèle mocké) + 2 intégration WAV/MP3 (vrai BasicPitch)
```

Le test d'intégration se skippe tout seul si basic-pitch n'est pas installé.

## Architecture interne

```
app/
├── main.py        création FastAPI, lifespan (charge le modèle 1×), middleware request_id
├── config.py      Settings (env ECHO_BP_*)
├── routes.py      couche transport : valide + délègue, zéro logique métier
├── service.py     wrap BasicPitch.predict (cœur testable, indépendant de HTTP)
├── schemas/midi.py  contrat de sortie (MidiSequence/NoteEvent) — stable pour l'aval
└── core/          errors (enveloppe uniforme) · log (JSON, jamais de contenu) · audio (validation)
```

Quand un 2e service rejoindra le backend, les pièces transverses de `core/` et le
contrat `schemas/midi.py` seront extraits dans un package partagé `echo-common`.
