-- Walz Orbit — Benchmark Reviews table
-- Run via Supabase SQL Editor (not prisma db push).
-- RBAC: service-role only; RLS blocks all direct client access.

CREATE TABLE IF NOT EXISTS orbit_benchmark_reviews (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  benchmark_key TEXT        NOT NULL,
  reviewer_id   TEXT        NOT NULL,
  verdict       TEXT        NOT NULL,
  issues        TEXT[]      NOT NULL DEFAULT '{}',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orbit_benchmark_reviews_key
  ON orbit_benchmark_reviews (benchmark_key);

CREATE INDEX IF NOT EXISTS idx_orbit_benchmark_reviews_reviewer
  ON orbit_benchmark_reviews (reviewer_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION orbit_benchmark_reviews_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orbit_benchmark_reviews_updated_at ON orbit_benchmark_reviews;
CREATE TRIGGER orbit_benchmark_reviews_updated_at
  BEFORE UPDATE ON orbit_benchmark_reviews
  FOR EACH ROW EXECUTE FUNCTION orbit_benchmark_reviews_set_updated_at();

-- Row-Level Security: block all direct client access; server API uses service role
ALTER TABLE orbit_benchmark_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orbit_benchmark_reviews_service_only"
  ON orbit_benchmark_reviews
  USING (false)
  WITH CHECK (false);
