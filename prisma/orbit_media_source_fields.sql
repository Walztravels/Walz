-- Orbit Media — comprehensive additive columns migration
-- Run once in Supabase SQL editor (idempotent; safe to re-run).
-- Adds ALL columns that exist in the Prisma schema but were not in the
-- original orbit_creative_studio.sql migration:
--
--   media_type      TEXT     — 'image' | 'video'  (was defaulted to image)
--   duration_ms     INTEGER  — video duration in ms
--   source_type     TEXT     — 'ai' | 'media_library' | 'manual_upload'
--   source_media_id TEXT     — MarketingMedia.id when source_type='media_library'
--
-- All columns are nullable / have defaults so existing rows remain valid.
-- Resolvers fall back to legacy storagePath sentinel logic when these are NULL.

ALTER TABLE orbit_media
  ADD COLUMN IF NOT EXISTS media_type      TEXT NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS duration_ms     INTEGER,
  ADD COLUMN IF NOT EXISTS source_type     TEXT,
  ADD COLUMN IF NOT EXISTS source_media_id TEXT;

-- Index for async job polling (generation_status)
CREATE INDEX IF NOT EXISTS idx_orbit_media_gen_status
  ON orbit_media (campaign_id, generation_status)
  WHERE generation_status IN ('pending', 'processing');

-- Composite index supports idempotency lookups and cascade queries
CREATE INDEX IF NOT EXISTS idx_orbit_media_campaign_source
  ON orbit_media (campaign_id, source_type, source_media_id);

-- ── Backfill existing rows ────────────────────────────────────────────────────

-- Backfill legacy media_library rows that used the storagePath sentinel.
UPDATE orbit_media
SET
  source_type     = 'media_library',
  source_media_id = SUBSTRING(storage_path FROM 16)
WHERE
  storage_path LIKE 'media_library:%'
  AND source_type IS NULL;

-- Backfill AI-generated rows
UPDATE orbit_media
SET source_type = 'ai'
WHERE
  source = 'generated'
  AND provider IN ('openai', 'replicate', 'fal', 'runway')
  AND source_type IS NULL;

-- Backfill manually-uploaded rows
UPDATE orbit_media
SET source_type = 'manual_upload'
WHERE
  (source = 'uploaded' OR provider = 'uploaded')
  AND source_type IS NULL;
