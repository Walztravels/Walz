-- Orbit Phase 1b SQL Migration
-- Run in Supabase SQL Editor. Safe to run more than once.

-- ── Extend orbit_settings with Phase 1b columns ───────────────────────────────
ALTER TABLE orbit_settings
  ADD COLUMN IF NOT EXISTS target_countries      TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_languages      TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_audiences      TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS services              TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS competitors           TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS priority_destinations TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS publishing_frequency  TEXT    NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS brand_voice           TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS internal_link_rules   TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS keyword_exclusions    TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approval_required     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS quality_threshold     INT     NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS automation_level      TEXT    NOT NULL DEFAULT 'generate_drafts',
  ADD COLUMN IF NOT EXISTS notifications_email   TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS token_cap_per_campaign INT    NOT NULL DEFAULT 4000;

-- ── orbit_campaigns ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_campaigns (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  status            TEXT    NOT NULL DEFAULT 'draft',  -- draft|review|approved|published|rejected
  objective         TEXT    NOT NULL,
  destination       TEXT    NOT NULL DEFAULT '',
  audience          TEXT    NOT NULL DEFAULT '',
  country           TEXT    NOT NULL DEFAULT '',
  platforms         TEXT[]  NOT NULL DEFAULT '{}',
  tone              TEXT    NOT NULL DEFAULT 'professional',
  promotion_details TEXT    NOT NULL DEFAULT '',
  cta               TEXT    NOT NULL DEFAULT '',
  landing_page      TEXT    NOT NULL DEFAULT '',
  start_date        TIMESTAMPTZ,
  end_date          TIMESTAMPTZ,
  content           JSONB   NOT NULL DEFAULT '{}',
  tokens_used       INT     NOT NULL DEFAULT 0,
  cost_usd          NUMERIC(10,6) NOT NULL DEFAULT 0,
  generated_at      TIMESTAMPTZ,
  generated_by      TEXT,
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  rejected_by       TEXT,
  rejected_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orbit_campaigns_status     ON orbit_campaigns(status);
CREATE INDEX IF NOT EXISTS orbit_campaigns_created_at ON orbit_campaigns(created_at DESC);

ALTER TABLE orbit_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON orbit_campaigns;
CREATE POLICY "service_role_full_access" ON orbit_campaigns FOR ALL USING (true);
