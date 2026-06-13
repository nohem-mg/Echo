#!/usr/bin/env bash
# Applique backend/db/init/01_registry.sql sur la Postgres du registre privé (2B).
# Usage (depuis backend/) :
#   export ECHO_REGISTRY_DATABASE_URL='postgresql://...'
#   ./scripts/init-registry-schema.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="${ROOT}/db/init/01_registry.sql"
URL="${ECHO_REGISTRY_DATABASE_URL:-}"

if [[ -z "${URL}" ]]; then
  echo "ERROR: ECHO_REGISTRY_DATABASE_URL is not set." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found. Install PostgreSQL client or run the SQL manually in Neon/Vercel console." >&2
  exit 1
fi

echo "Applying registry schema to shared database..."
psql "${URL}" -v ON_ERROR_STOP=1 -f "${SQL}"
echo "Done. Table registry_tracks ready for registry-service (Step 2B)."
