-- Release 3C: Recovery Messaging
-- Run this in Supabase SQL editor after release_3a_recovery_engine.sql.

-- Add customer messaging tracking columns to RecoveryOpportunity
ALTER TABLE "RecoveryOpportunity"
  ADD COLUMN IF NOT EXISTS "contactCount"    INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastContactedAt" TIMESTAMP(3);

-- Add index on nextActionAt for efficient scheduled contact queries
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_nextActionAt_idx"
  ON "RecoveryOpportunity"("nextActionAt");
