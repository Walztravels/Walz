-- Orbit Phase 2 migration
-- Run this in Supabase SQL editor (Dashboard → SQL Editor → New query)
-- NEVER run prisma db push

-- 1. orbit_publish_log: records every Buffer publish attempt
CREATE TABLE IF NOT EXISTS orbit_publish_log (
  id               TEXT      PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id      TEXT      NOT NULL REFERENCES orbit_campaigns(id) ON DELETE CASCADE,
  platform         TEXT      NOT NULL,
  buffer_update_id TEXT,
  status           TEXT      NOT NULL DEFAULT 'sent',   -- sent | skipped | error
  error            TEXT,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       TEXT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orbit_publish_log_campaign ON orbit_publish_log (campaign_id);

ALTER TABLE orbit_publish_log ENABLE ROW LEVEL SECURITY;

-- 2. last_auto_audit_at on orbit_settings (used by cron to gate re-runs)
ALTER TABLE orbit_settings
  ADD COLUMN IF NOT EXISTS last_auto_audit_at TIMESTAMPTZ;

-- 3. image_cap_per_campaign (was missing from prod — backfilled here in case not yet applied)
ALTER TABLE orbit_settings
  ADD COLUMN IF NOT EXISTS image_cap_per_campaign INT NOT NULL DEFAULT 8;
