-- Orbit Phase 1c SQL Migration — Media Library (Replicate/Flux Schnell)
-- Safe to run more than once.
-- Replaces orbit_campaign_images (Canva) with orbit_media (shared library).

-- Drop old Canva-based table if it was ever created
DROP TABLE IF EXISTS orbit_campaign_images CASCADE;

-- ── orbit_media ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orbit_media (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source        TEXT NOT NULL,                       -- 'generated' | 'uploaded'
  storage_path  TEXT NOT NULL,                       -- path inside orbit-media bucket
  public_url    TEXT,                                -- cached Supabase public URL
  format        TEXT NOT NULL,                       -- '1080x1920' | '1080x1350' | '1200x628' | '1024x1024'
  destination   TEXT,                                -- 'lagos' | 'dubai' | 'harare' …
  campaign_type TEXT,                                -- 'december_flights' | 'visa' …
  prompt        TEXT,                                -- generation prompt (if generated)
  alt_text      TEXT NOT NULL DEFAULT '',
  cost_usd      NUMERIC(10,4) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft',       -- draft | approved | rejected
  approved_by   TEXT,
  approved_at   TIMESTAMPTZ,
  campaign_id   TEXT REFERENCES orbit_campaigns(id) ON DELETE SET NULL,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orbit_media_dest    ON orbit_media(destination, campaign_type);
CREATE INDEX IF NOT EXISTS idx_orbit_media_campaign ON orbit_media(campaign_id);

ALTER TABLE orbit_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON orbit_media;
CREATE POLICY "service_role_full_access" ON orbit_media FOR ALL USING (true);

-- ── orbit_settings: add image cap ────────────────────────────────────────────

ALTER TABLE orbit_settings
  ADD COLUMN IF NOT EXISTS image_cap_per_campaign INT NOT NULL DEFAULT 8;
