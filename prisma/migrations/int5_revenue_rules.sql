-- ══════════════════════════════════════════════════════════════════════════
-- INT-5 — Revenue Opportunities rules engine. Idempotent; ADDITIVE.
-- Run manually in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════════

-- Idempotency key so cron runs can never duplicate an opportunity.
ALTER TABLE "RevenueOpportunity" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

-- Partial unique index (NULLs exempt — manual/legacy rows keep working).
CREATE UNIQUE INDEX IF NOT EXISTS "RevenueOpportunity_dedupeKey_unique"
  ON "RevenueOpportunity"("dedupeKey") WHERE "dedupeKey" IS NOT NULL;

-- Verification
SELECT 'VERIFY dedupeKey column' AS check,
       count(*)::text AS value
FROM information_schema.columns
WHERE table_name = 'RevenueOpportunity' AND column_name = 'dedupeKey';
