-- Echo private registry — schema owned by the database, not the application.
-- Postgres runs every *.sql here once, on first cluster init
-- (mounted at /docker-entrypoint-initdb.d/ — see backend/docker-compose.yml).
-- Services connect and run DML only; they never issue DDL.

CREATE TABLE IF NOT EXISTS registry_tracks (
    track_id   TEXT PRIMARY KEY,
    midi       JSONB NOT NULL,        -- full MidiSequence: source of truth, never discarded
    intervals  INTEGER[] NOT NULL,    -- precomputed skyline intervals: compare without re-extracting
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- midi is kept so features can be recomputed if the similarity algorithm changes
-- (re-index from source); intervals is the cached feature used at compare time.
