-- Orbit Creative OS — additive migration. Run ONCE in the Supabase SQL editor.
-- Idempotent — safe to re-run. Existing OrbitMedia rows remain untouched.

-- 1) Async generation jobs
CREATE TABLE IF NOT EXISTS orbit_creative_jobs (
  id                text PRIMARY KEY,
  campaign_id       text,
  capability        text NOT NULL,
  lane              text NOT NULL,
  provider          text NOT NULL,
  model_key         text NOT NULL,
  status            text NOT NULL DEFAULT 'queued',
  provider_job_id   text,
  input_refs        jsonb,
  output_media_id   text,
  output_url        text,
  cost_usd          numeric(10,4),
  error             text,
  retry_count       integer NOT NULL DEFAULT 0,
  staff_email       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orbit_creative_jobs_campaign_idx ON orbit_creative_jobs (campaign_id);
CREATE INDEX IF NOT EXISTS orbit_creative_jobs_status_idx   ON orbit_creative_jobs (status);
ALTER TABLE orbit_creative_jobs ENABLE ROW LEVEL SECURITY;

-- 2) Reference Board: purpose tag on existing reference media (additive)
ALTER TABLE orbit_media
  ADD COLUMN IF NOT EXISTS reference_purpose text;

SELECT 'Creative OS ready' AS result;
