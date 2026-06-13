-- Echo private registry — schema owned by the database, not the application.
-- Postgres runs every *.sql here once, on first cluster init
-- (mounted at /docker-entrypoint-initdb.d/ — see backend/docker-compose.yml).
-- Services connect and run DML only; they never issue DDL.

-- One row per SEALED track (verdict CLEAN). The pipeline computes (convert, check,
-- compare) persist nothing; the CRE writes here only at SEAL.
CREATE TABLE IF NOT EXISTS registry_tracks (
    track_id    TEXT PRIMARY KEY,
    midi        JSONB NOT NULL,        -- full MidiSequence: source of truth, never discarded
    intervals   INTEGER[] NOT NULL,    -- precomputed skyline intervals: compare without re-extracting
    fingerprint JSONB,                 -- audio fingerprint, set at SEAL; null until produced upstream
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- midi is kept so features can be recomputed if the similarity algorithm changes
-- (re-index from source); intervals is the cached feature used at compare time.
