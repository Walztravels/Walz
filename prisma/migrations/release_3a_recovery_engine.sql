-- Release 3A: Recovery Engine
-- Run this in Supabase SQL editor (never use prisma db push in production).
--
-- Changes:
--   1. Add commercialSource + tripItemId to ActivityBooking
--   2. Create RecoveryOpportunity table

-- ── 1. ActivityBooking new attribution fields ─────────────────────────────────
ALTER TABLE "ActivityBooking"
  ADD COLUMN IF NOT EXISTS "commercialSource" TEXT,
  ADD COLUMN IF NOT EXISTS "tripItemId"       TEXT;

-- ── 2. RecoveryOpportunity ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecoveryOpportunity" (
  "id"                  TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "type"                TEXT         NOT NULL,
  "status"              TEXT         NOT NULL DEFAULT 'OPEN',
  "dedupeKey"           TEXT         NOT NULL,

  "userId"              TEXT,
  "leadId"              TEXT,
  "tripId"              TEXT,
  "cartSessionId"       TEXT,
  "quoteId"             TEXT,
  "bookingId"           TEXT,
  "activityBookingId"   TEXT,

  "assignedToId"        TEXT,

  "amount"              DOUBLE PRECISION,
  "currency"            TEXT,

  "reason"              TEXT         NOT NULL,
  "priority"            TEXT         NOT NULL DEFAULT 'MEDIUM',

  "detectedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt"      TIMESTAMP(3),
  "nextActionAt"        TIMESTAMP(3),

  "recoveredAt"         TIMESTAMP(3),
  "recoveredBookingId"  TEXT,
  "recoveredAmount"     DOUBLE PRECISION,
  "recoveredCurrency"   TEXT,

  "notes"               TEXT,

  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecoveryOpportunity_pkey"         PRIMARY KEY ("id"),
  CONSTRAINT "RecoveryOpportunity_dedupeKey_key" UNIQUE ("dedupeKey")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_status_idx"         ON "RecoveryOpportunity"("status");
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_priority_status_idx" ON "RecoveryOpportunity"("priority", "status");
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_type_status_idx"    ON "RecoveryOpportunity"("type", "status");
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_assignedToId_idx"   ON "RecoveryOpportunity"("assignedToId");
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_cartSessionId_idx"  ON "RecoveryOpportunity"("cartSessionId");
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_activityBookingId_idx" ON "RecoveryOpportunity"("activityBookingId");
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_leadId_idx"         ON "RecoveryOpportunity"("leadId");
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_detectedAt_idx"     ON "RecoveryOpportunity"("detectedAt");

-- Auto-update updatedAt trigger
CREATE OR REPLACE FUNCTION update_recovery_opportunity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recovery_opportunity_updated_at ON "RecoveryOpportunity";
CREATE TRIGGER recovery_opportunity_updated_at
  BEFORE UPDATE ON "RecoveryOpportunity"
  FOR EACH ROW EXECUTE FUNCTION update_recovery_opportunity_updated_at();

-- Row-level security (consistent with other tables in this project)
ALTER TABLE "RecoveryOpportunity" ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by API routes)
CREATE POLICY "service_role_full_access" ON "RecoveryOpportunity"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users have no direct access (all access via API routes)
-- No anon policy — this table is internal only
