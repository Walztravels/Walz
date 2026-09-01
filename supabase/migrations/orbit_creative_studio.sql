-- Orbit Creative Studio — additive columns on orbit_media
-- Run in Supabase SQL editor. Do NOT use prisma db push.

ALTER TABLE "orbit_media"
  ADD COLUMN IF NOT EXISTS "provider"          TEXT,
  ADD COLUMN IF NOT EXISTS "model"             TEXT,
  ADD COLUMN IF NOT EXISTS "provider_job_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "generation_status" TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS "width"             INTEGER,
  ADD COLUMN IF NOT EXISTS "height"            INTEGER,
  ADD COLUMN IF NOT EXISTS "poster_data"       JSONB,
  ADD COLUMN IF NOT EXISTS "is_reference"      BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for polling pending async jobs
CREATE INDEX IF NOT EXISTS "idx_orbit_media_gen_status"
  ON "orbit_media" ("campaign_id", "generation_status")
  WHERE "generation_status" IN ('pending', 'processing');
