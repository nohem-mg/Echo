# Fixtures audio (dev)

Copie ta piste ici pour tester le pipeline avec une **vraie musique** :

```bash
cp ~/Music/ma-piste.mp3 backend/fixtures/audio/upload.mp3
```

Formats supportés : `.mp3`, `.wav`, `.flac` (selon BasicPitch / ACRCloud).

Puis lance la sim avec le target `dev-audio-settings` et le payload `sample-submission-real.json`.

Les pistes longues sont **coupées à 15 s** par défaut (`ECHO_MAX_AUDIO_SECONDS`, max **15 s** pour rester sous la limite CRE sim **consensus 25 KB** — pas seulement HTTP 250 KB).

**Alternative** sans copier le fichier :

```bash
ECHO_DEV_AUDIO=/chemin/vers/ma-piste.mp3 bun backend/dev-gateway/server.ts
```

(Utile avec `staging-settings` + Confidential HTTP, où le sim envoie `<no value>` pour `audioRef`.)
