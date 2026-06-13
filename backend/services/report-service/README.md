# report-service (Step 4)

Extraction acoustique depuis l'**audio brut** (clé, mode, BPM, empreinte) + rapport final classé.

```bash
docker compose up --build report-service   # :8005
curl -s http://127.0.0.1:8005/health
```

Contrat : `POST /api/report` (multipart) — consommé par le dev-gateway, appelé par le CRE en Step 4.

Verdict : meilleur score `< 75 %` → **CLEAN** ; `≥ 75 %` → **SIMILAR**.
