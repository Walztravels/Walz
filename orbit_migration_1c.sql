-- Orbit Phase 1c SQL Migration — Campaign Images
-- Run in Supabase SQL Editor. Safe to run more than once.

CREATE TABLE IF NOT EXISTS orbit_campaign_images (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     TEXT NOT NULL REFERENCES orbit_campaigns(id) ON DELETE CASCADE,
  format          TEXT NOT NULL,  -- square_1024 | feed_1080x1350 | story_1080x1920 | ad_1200x628
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft|approved|rejected
  canva_design_id TEXT,
  export_url      TEXT,
  thumbnail_url   TEXT,
  alt_text        TEXT NOT NULL DEFAULT '',
  text_layers     JSONB NOT NULL DEFAULT '{}',
  version         INT NOT NULL DEFAULT 1,
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orbit_campaign_images_campaign_id ON orbit_campaign_images(campaign_id);

ALTER TABLE orbit_campaign_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON orbit_campaign_images;
CREATE POLICY "service_role_full_access" ON orbit_campaign_images FOR ALL USING (true);
