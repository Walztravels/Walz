-- Orbit Media — additive source reference fields
-- Run once in Supabase SQL editor (idempotent; safe to re-run).
--
-- Adds explicit source-type tracking to orbit_media:
--   source_type     TEXT    — 'ai' | 'media_library' | 'manual_upload'
--   source_media_id TEXT    — MarketingMedia.id when source_type='media_library'
--
-- Existing rows without these columns remain valid:
--   resolveOrbitMediaAsset() falls back to legacy storagePath sentinel logic
--   or infers from the provider field.
--
-- No foreign key constraint on source_media_id: MarketingMedia is a separate
-- system and its records can be deleted independently of Orbit attachments.
-- The soft-delete (status='rejected', campaignId=null) path already
-- preserves the MarketingMedia record when archiving a library attachment.

ALTER TABLE orbit_media
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_media_id TEXT;

-- Composite index supports both idempotency lookups and cascade queries
CREATE INDEX IF NOT EXISTS idx_orbit_media_campaign_source
  ON orbit_media (campaign_id, source_type, source_media_id);

-- Optional: backfill legacy rows that used the storagePath sentinel.
-- This is safe to run at any time and is idempotent.
-- It does NOT touch rows that already have source_type set.
UPDATE orbit_media
SET
  source_type     = 'media_library',
  source_media_id = SUBSTRING(storage_path FROM 16)  -- strips 'media_library:' prefix (15 chars + colon)
WHERE
  storage_path LIKE 'media_library:%'
  AND source_type IS NULL;

-- Backfill AI-generated rows (source='generated' with a real AI provider)
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
