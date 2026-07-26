-- Jade Intelligence v4 – features 8-14. Run once in the Supabase SQL editor.

-- Feature 11: Family Constellation Memory
CREATE TABLE IF NOT EXISTS family_constellations (
  id              TEXT PRIMARY KEY,
  primary_client  TEXT NOT NULL UNIQUE,
  household_name  TEXT,
  members         JSONB DEFAULT '[]',
  home_country    TEXT,
  hub_countries   JSONB DEFAULT '[]',
  recurring_trips JSONB DEFAULT '[]',
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_primary ON family_constellations(primary_client);

-- Feature 13: Jade Whisper queue
CREATE TABLE IF NOT EXISTS whisper_queue (
  conversation_id TEXT PRIMARY KEY,
  contact_phone   TEXT,
  contact_name    TEXT,
  destination     TEXT,
  quoted_price    TEXT,
  stage_note      TEXT,
  whisper_count   INT DEFAULT 0,
  last_whisper_at TIMESTAMPTZ,
  last_activity   TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whisper_active
  ON whisper_queue(last_activity) WHERE is_active = true;

-- Feature 8: assessment log
CREATE TABLE IF NOT EXISTS visa_assessments (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id TEXT,
  nationality     TEXT,
  destination     TEXT,
  score           INT,
  band            TEXT,
  recommendation  TEXT,
  did_apply       BOOLEAN,
  actual_outcome  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
