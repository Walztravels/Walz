-- =============================================================================
-- ORBIT PHASE 2 & 3 MIGRATION
-- Run this in the Supabase SQL Editor
-- =============================================================================

-- ── Keyword Groups ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_keyword_groups (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       TEXT NOT NULL,
  topic      TEXT NOT NULL,
  intent     TEXT NOT NULL DEFAULT 'informational',
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE orbit_keyword_groups ENABLE ROW LEVEL SECURITY;

-- ── Keywords ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_keywords (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  keyword          TEXT NOT NULL,
  group_id         TEXT REFERENCES orbit_keyword_groups(id) ON DELETE SET NULL,
  intent           TEXT NOT NULL DEFAULT 'informational',
  country          TEXT NOT NULL DEFAULT 'gb',
  language         TEXT NOT NULL DEFAULT 'en',
  device           TEXT NOT NULL DEFAULT 'desktop',
  source           TEXT NOT NULL DEFAULT 'manual',
  linked_page_slug TEXT,
  volume           INT,
  difficulty       INT,
  cpc              NUMERIC(10,4),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(keyword, country, language, device)
);
CREATE INDEX IF NOT EXISTS idx_orbit_keywords_group ON orbit_keywords (group_id);
ALTER TABLE orbit_keywords ENABLE ROW LEVEL SECURITY;

-- ── Keyword Rankings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_keyword_rankings (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  keyword_id        TEXT NOT NULL REFERENCES orbit_keywords(id) ON DELETE CASCADE,
  position          NUMERIC(8,2),
  best_position     NUMERIC(8,2),
  previous_position NUMERIC(8,2),
  url               TEXT,
  impressions       INT,
  clicks            INT,
  ctr               NUMERIC(8,6),
  source            TEXT NOT NULL DEFAULT 'gsc',
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orbit_keyword_rankings_kw ON orbit_keyword_rankings (keyword_id, recorded_at);
ALTER TABLE orbit_keyword_rankings ENABLE ROW LEVEL SECURITY;

-- ── Content Briefs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_content_briefs (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  keyword_id          TEXT REFERENCES orbit_keywords(id) ON DELETE SET NULL,
  primary_keyword     TEXT NOT NULL,
  supporting_keywords TEXT[] NOT NULL DEFAULT '{}',
  intent              TEXT NOT NULL DEFAULT 'informational',
  content_type        TEXT NOT NULL DEFAULT 'destination_guide',
  suggested_url       TEXT,
  title               TEXT NOT NULL,
  meta_description    TEXT,
  outline             JSONB NOT NULL DEFAULT '[]',
  faqs                JSONB NOT NULL DEFAULT '[]',
  internal_links      JSONB NOT NULL DEFAULT '[]',
  external_sources    JSONB NOT NULL DEFAULT '[]',
  structured_data     TEXT,
  status              TEXT NOT NULL DEFAULT 'draft',
  linked_post_id      TEXT,
  generated_by        TEXT,
  approved_by         TEXT,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orbit_briefs_keyword ON orbit_content_briefs (keyword_id);
CREATE INDEX IF NOT EXISTS idx_orbit_briefs_status ON orbit_content_briefs (status);
ALTER TABLE orbit_content_briefs ENABLE ROW LEVEL SECURITY;

-- ── Content Drafts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_content_drafts (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brief_id          TEXT NOT NULL REFERENCES orbit_content_briefs(id) ON DELETE CASCADE,
  version           INT NOT NULL DEFAULT 1,
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  excerpt           TEXT,
  meta_description  TEXT,
  focus_keyword     TEXT,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'draft',
  scheduled_at      TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  published_post_id TEXT,
  flagged_claims    JSONB NOT NULL DEFAULT '[]',
  created_by        TEXT,
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orbit_drafts_brief ON orbit_content_drafts (brief_id);
CREATE INDEX IF NOT EXISTS idx_orbit_drafts_status ON orbit_content_drafts (status, scheduled_at);
ALTER TABLE orbit_content_drafts ENABLE ROW LEVEL SECURITY;

-- ── Draft Version History ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_draft_versions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  draft_id   TEXT NOT NULL REFERENCES orbit_content_drafts(id) ON DELETE CASCADE,
  version    INT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  saved_by   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orbit_draft_versions ON orbit_draft_versions (draft_id);
ALTER TABLE orbit_draft_versions ENABLE ROW LEVEL SECURITY;

-- ── Competitors ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_competitors (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  domain     TEXT NOT NULL UNIQUE,
  name       TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE orbit_competitors ENABLE ROW LEVEL SECURITY;

-- ── Competitor Snapshots ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_competitor_snapshots (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  competitor_id    TEXT NOT NULL REFERENCES orbit_competitors(id) ON DELETE CASCADE,
  organic_traffic  INT,
  organic_keywords INT,
  domain_score     INT,
  backlinks        INT,
  top_keywords     JSONB NOT NULL DEFAULT '[]',
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orbit_competitor_snapshots ON orbit_competitor_snapshots (competitor_id, recorded_at);
ALTER TABLE orbit_competitor_snapshots ENABLE ROW LEVEL SECURITY;

-- ── Analytics Snapshots ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_analytics_snapshots (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date        TIMESTAMPTZ NOT NULL,
  source      TEXT NOT NULL,
  page_url    TEXT,
  clicks      INT,
  impressions INT,
  ctr         NUMERIC(8,6),
  position    NUMERIC(8,2),
  sessions    INT,
  users       INT,
  conversions INT,
  spend       NUMERIC(10,4),
  cpc         NUMERIC(10,4),
  revenue     NUMERIC(10,4),
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date, source, page_url)
);
CREATE INDEX IF NOT EXISTS idx_orbit_analytics_date_source ON orbit_analytics_snapshots (date, source);
CREATE INDEX IF NOT EXISTS idx_orbit_analytics_page ON orbit_analytics_snapshots (page_url, source);
ALTER TABLE orbit_analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- ── Schedule Items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orbit_schedule_items (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  failed_at    TIMESTAMPTZ,
  error        TEXT,
  retries      INT NOT NULL DEFAULT 0,
  ref_id       TEXT,
  ref_type     TEXT,
  platform     TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orbit_schedule_scheduled ON orbit_schedule_items (scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_orbit_schedule_type ON orbit_schedule_items (type, status);
ALTER TABLE orbit_schedule_items ENABLE ROW LEVEL SECURITY;

-- ── BlogPost scheduledAt column ───────────────────────────────────────────────
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMPTZ;
