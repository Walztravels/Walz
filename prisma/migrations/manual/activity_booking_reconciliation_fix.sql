-- ============================================================
-- Activity Booking: schema drift repair
-- Run in Supabase SQL editor.
-- All operations are idempotent — safe to run multiple times.
--
-- Root cause: activity_booking_hardening.sql added "reconciledAt"
-- but the Prisma schema has always expected "lastReconciledAt".
-- This mismatch caused:
--   Invalid `prisma.activityBooking.create()` invocation:
--   The column `ActivityBooking.lastReconciledAt` does not exist in the current database.
--
-- This migration also covers activityTitle/location/travelDate which
-- were in the Prisma schema from day one but never in a migration file
-- (they may already be present — the IF NOT EXISTS guards are safe either way).
-- ============================================================

-- ── 1. lastReconciledAt — rename old column or add new one ─────────────────────
DO $$
BEGIN
  -- Case A: old column 'reconciledAt' exists → rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ActivityBooking'
      AND column_name  = 'reconciledAt'
  ) THEN
    ALTER TABLE "ActivityBooking" RENAME COLUMN "reconciledAt" TO "lastReconciledAt";
    RAISE NOTICE 'Renamed reconciledAt → lastReconciledAt';

  -- Case B: neither column exists → add lastReconciledAt
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ActivityBooking'
      AND column_name  = 'lastReconciledAt'
  ) THEN
    ALTER TABLE "ActivityBooking" ADD COLUMN "lastReconciledAt" TIMESTAMP(3);
    RAISE NOTICE 'Added lastReconciledAt column';

  -- Case C: lastReconciledAt already exists → no-op
  ELSE
    RAISE NOTICE 'lastReconciledAt already present — no action needed';
  END IF;
END $$;

-- ── 2. Safety net: other fields that were in schema but not in any migration ────
-- These may already exist; the guard prevents errors if they do.
ALTER TABLE "ActivityBooking"
  ADD COLUMN IF NOT EXISTS "activityTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "location"      TEXT,
  ADD COLUMN IF NOT EXISTS "travelDate"    TEXT,
  ADD COLUMN IF NOT EXISTS "paymentRef"    TEXT;

-- ── 3. Verify ──────────────────────────────────────────────────────────────────
-- After running, this query should return at least these rows:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'ActivityBooking'
-- AND column_name IN ('lastReconciledAt','activityTitle','location','travelDate','paymentRef')
-- ORDER BY column_name;
