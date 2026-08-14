-- Orbit Platform — Phase 1a SQL Migration
-- Run this in the Supabase SQL Editor (NOT prisma db push).
-- Safe to run more than once — all tables use IF NOT EXISTS.

-- ── 1. orbit_settings (singleton row) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_settings (
  id           TEXT PRIMARY KEY DEFAULT 'singleton',
  site_url     TEXT NOT NULL DEFAULT 'https://www.walztravels.com',
  brand_name   TEXT NOT NULL DEFAULT 'WalzTravels',
  brand_suffix TEXT NOT NULL DEFAULT '| WalzTravels',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. orbit_integrations (one row per integration key) ──────────────────────
CREATE TABLE IF NOT EXISTS orbit_integrations (
  id              TEXT PRIMARY KEY,          -- e.g. 'se_ranking', 'google_search_console'
  connected       BOOLEAN NOT NULL DEFAULT FALSE,
  credentials_set BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at  TIMESTAMPTZ,
  error           TEXT,
  meta            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. orbit_audits ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_audits (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  site_url        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',  -- queued|running|complete|failed
  pages_total     INT NOT NULL DEFAULT 0,
  pages_done      INT NOT NULL DEFAULT 0,
  issues_critical INT NOT NULL DEFAULT 0,
  issues_high     INT NOT NULL DEFAULT 0,
  issues_medium   INT NOT NULL DEFAULT 0,
  issues_low      INT NOT NULL DEFAULT 0,
  score           INT,
  triggered_by    TEXT,
  error           TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. orbit_audit_pages ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_audit_pages (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id            TEXT NOT NULL REFERENCES orbit_audits(id) ON DELETE CASCADE,
  url                 TEXT NOT NULL,
  status_code         INT,
  response_time_ms    INT,
  title               TEXT,
  meta_description    TEXT,
  canonical           TEXT,
  robots_meta         TEXT,
  h1_count            INT NOT NULL DEFAULT 0,
  has_og              BOOLEAN NOT NULL DEFAULT FALSE,
  has_twitter_card    BOOLEAN NOT NULL DEFAULT FALSE,
  has_structured_data BOOLEAN NOT NULL DEFAULT FALSE,
  is_indexed          BOOLEAN NOT NULL DEFAULT TRUE,
  in_sitemap          BOOLEAN NOT NULL DEFAULT FALSE,
  image_missing_alt   INT NOT NULL DEFAULT 0,
  internal_links      TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orbit_audit_pages_audit_id ON orbit_audit_pages(audit_id);

-- ── 5. orbit_audit_issues ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_audit_issues (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id    TEXT NOT NULL REFERENCES orbit_audits(id) ON DELETE CASCADE,
  page_id     TEXT REFERENCES orbit_audit_pages(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  check_name  TEXT NOT NULL,
  severity    TEXT NOT NULL,    -- critical|high|medium|low
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence    TEXT,
  fix_preview TEXT,
  status      TEXT NOT NULL DEFAULT 'open',  -- open|task_created|fix_applied|dismissed
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  fixed_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orbit_audit_issues_audit_id ON orbit_audit_issues(audit_id);
CREATE INDEX IF NOT EXISTS orbit_audit_issues_page_id  ON orbit_audit_issues(page_id);

-- ── 6. orbit_audit_logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_audit_logs (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id   TEXT REFERENCES orbit_audits(id) ON DELETE SET NULL,
  issue_id   TEXT REFERENCES orbit_audit_issues(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  actor      TEXT NOT NULL,
  detail     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orbit_audit_logs_audit_id ON orbit_audit_logs(audit_id);

-- ── RLS: restrict all Orbit tables to authenticated users only ────────────────
-- (API routes enforce super_admin — no per-row policies needed at DB level)
ALTER TABLE orbit_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_integrations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_audits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_audit_pages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_audit_issues  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_audit_logs    ENABLE ROW LEVEL SECURITY;

-- Allow the service_role (used by the backend via the DIRECT_URL) full access
CREATE POLICY IF NOT EXISTS "service_role_full_access" ON orbit_settings      FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_role_full_access" ON orbit_integrations  FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_role_full_access" ON orbit_audits        FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_role_full_access" ON orbit_audit_pages   FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_role_full_access" ON orbit_audit_issues  FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_role_full_access" ON orbit_audit_logs    FOR ALL USING (true);
