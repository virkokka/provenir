-- D1 schema for Provenir Worker
-- Run via: wrangler d1 execute provenir-db --file=src/schema.sql

-- ---------------------------------------------------------------------------
-- provenance
-- Stores content registrations.  Authors or publishers can register a
-- content_hash to establish a first-seen timestamp for their work.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provenance (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    content_hash   TEXT    NOT NULL UNIQUE,  -- BLAKE3 hex digest
    url            TEXT    NOT NULL,
    published_at   TEXT,                     -- ISO-8601, nullable (submitter-supplied)
    author         TEXT,                     -- DID / ORCID / free-form, nullable
    registered_at  TEXT    NOT NULL          -- ISO-8601, server-set on insert
);

CREATE INDEX IF NOT EXISTS idx_provenance_hash ON provenance (content_hash);

-- ---------------------------------------------------------------------------
-- score_audit
-- Append-only log of every scoring event.  Used for analytics, appeals, and
-- model tuning.  Never updated — only inserted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS score_audit (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    content_hash    TEXT    NOT NULL,
    url             TEXT    NOT NULL,
    score           INTEGER NOT NULL,  -- 0-100 composite score
    breakdown_json  TEXT    NOT NULL,  -- JSON snapshot of ScoringInputs
    scored_at       TEXT    NOT NULL   -- ISO-8601
);

CREATE INDEX IF NOT EXISTS idx_audit_hash     ON score_audit (content_hash);
CREATE INDEX IF NOT EXISTS idx_audit_scored   ON score_audit (scored_at);
