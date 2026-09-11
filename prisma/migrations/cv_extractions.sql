-- ══════════════════════════════════════════════════════════════════════════
-- Recruitment CV extraction results — server-only text + audit history.
-- Run manually in the Supabase SQL editor. Idempotent; purely ADDITIVE.
-- Until this runs, the code degrades gracefully: extraction still works,
-- results are just not persisted/reused between runs.
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cv_extractions (
  id                TEXT PRIMARY KEY,
  document_id       TEXT NOT NULL,
  application_id    TEXT NOT NULL,
  checksum          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  method            TEXT,
  extractor_version TEXT NOT NULL DEFAULT '1',
  page_count        INTEGER,
  failure_code      TEXT,
  text              TEXT,
  char_count        INTEGER NOT NULL DEFAULT 0,
  mime_stored       TEXT,
  mime_detected     TEXT,
  requested_by      TEXT,
  created_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at      TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS idx_cv_extractions_doc_checksum ON cv_extractions (document_id, checksum);
CREATE INDEX IF NOT EXISTS idx_cv_extractions_app_created  ON cv_extractions (application_id, created_at);

-- Verification
SELECT 'VERIFY: cv_extractions table exists (0 rows until first extraction)' AS check, count(*)::text AS value FROM cv_extractions;
