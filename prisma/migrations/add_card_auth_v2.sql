-- Card Authorization v2 migration
-- Columns use camelCase to match how Prisma maps field names to PostgreSQL
-- (Prisma uses the field name as the column name unless @map is specified).
-- Run in Supabase SQL editor AFTER add_card_authorizations.sql.

-- ─── Phase 1: New columns on card_authorizations ──────────────────────────────

ALTER TABLE card_authorizations
  ADD COLUMN IF NOT EXISTS "amountMinor"         BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "capturedAmountMinor"  BIGINT,
  ADD COLUMN IF NOT EXISTS "captureRequestedAt"   TIMESTAMPTZ;

-- ─── Phase 2: Backfill amountMinor from existing amount ───────────────────────
-- Walz-supported currencies (GBP, USD, EUR, CAD, AED, NGN) are all 2-decimal.
UPDATE card_authorizations
SET "amountMinor" = ROUND(amount * 100)::BIGINT
WHERE "amountMinor" = 0 AND amount > 0;

-- Backfill capturedAmountMinor from capturedAmount where present
UPDATE card_authorizations
SET "capturedAmountMinor" = ROUND("capturedAmount" * 100)::BIGINT
WHERE "capturedAmount" IS NOT NULL AND "capturedAmountMinor" IS NULL;

-- ─── Phase 3: Audit event table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS card_authorization_events (
  id               TEXT        NOT NULL PRIMARY KEY,
  "authorizationId" TEXT       NOT NULL REFERENCES card_authorizations(id) ON DELETE CASCADE,
  "eventType"      TEXT        NOT NULL,
  "staffEmail"     TEXT,
  "amountMinor"    BIGINT,
  currency         TEXT,
  "stripeEventId"  TEXT        UNIQUE,
  metadata         JSONB,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  ON card_authorization_events("authorizationId");

CREATE INDEX IF NOT EXISTS idx_card_auth_events_type
  ON card_authorization_events("eventType");
