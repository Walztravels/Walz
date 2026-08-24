-- Card Authorization v2 migration
-- Run in Supabase SQL editor AFTER add_card_authorizations.sql
-- Safe to run on empty or populated tables.

-- ─── Phase 1: New columns on card_authorizations ──────────────────────────────

ALTER TABLE card_authorizations
  ADD COLUMN IF NOT EXISTS amount_minor         BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS captured_amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS capture_requested_at  TIMESTAMPTZ;

-- ─── Phase 2: Backfill amountMinor from existing Float amount ─────────────────
-- Assumes 2-decimal currencies (GBP, USD, EUR, CAD, AED, NGN — all Walz currencies).
-- Confirm record count before running: SELECT COUNT(*), currency FROM card_authorizations GROUP BY currency;
UPDATE card_authorizations
SET amount_minor = ROUND(amount * 100)::BIGINT
WHERE amount_minor = 0 AND amount > 0;

-- Also backfill capturedAmountMinor from capturedAmount where present
UPDATE card_authorizations
SET captured_amount_minor = ROUND(captured_amount * 100)::BIGINT
WHERE captured_amount IS NOT NULL AND captured_amount_minor IS NULL;

-- ─── Phase 3: Audit event table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS card_authorization_events (
  id               TEXT        NOT NULL PRIMARY KEY,
  authorization_id TEXT        NOT NULL REFERENCES card_authorizations(id) ON DELETE CASCADE,
  event_type       TEXT        NOT NULL,
  staff_email      TEXT,
  amount_minor     BIGINT,
  currency         TEXT,
  stripe_event_id  TEXT        UNIQUE,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE card_authorization_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'card_authorization_events' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON card_authorization_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_card_auth_events_auth_id
  ON card_authorization_events(authorization_id);

CREATE INDEX IF NOT EXISTS idx_card_auth_events_type
  ON card_authorization_events(event_type);

-- No stripe_event_id index needed — covered by the UNIQUE constraint.
