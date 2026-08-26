-- ============================================================
-- Activity Booking Hardening Migration
-- Run in Supabase SQL editor.
-- All operations are idempotent (IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- 1. New columns on ActivityBooking
ALTER TABLE "ActivityBooking"
  ADD COLUMN IF NOT EXISTS "cartItemId"               TEXT,
  ADD COLUMN IF NOT EXISTS "supplierConfirmingAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "supplierConfirmedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentReceiptSentAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmationEmailSentAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failureAlertSentAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reconciledAt"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reconciliationAttempts"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failureReason"            TEXT;

-- 2. Partial unique index for (stripeSessionId, cartItemId).
--    NULL values are excluded so existing rows are never affected.
CREATE UNIQUE INDEX IF NOT EXISTS "ActivityBooking_session_item_unique"
  ON "ActivityBooking"("stripeSessionId", "cartItemId")
  WHERE "stripeSessionId" IS NOT NULL AND "cartItemId" IS NOT NULL;

-- 3. ActivityBookingAttempt — durable log of every supplier API call
CREATE TABLE IF NOT EXISTS "ActivityBookingAttempt" (
  "id"                       TEXT        NOT NULL,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activityBookingId"        TEXT        NOT NULL,
  "supplier"                 TEXT        NOT NULL,
  "action"                   TEXT        NOT NULL DEFAULT 'BOOK',
  "status"                   TEXT        NOT NULL DEFAULT 'CREATED',
  "partnerBookingReference"  TEXT,
  "supplierBookingReference" TEXT,
  "supplierRequestId"        TEXT,
  "startedAt"                TIMESTAMP(3) NOT NULL,
  "completedAt"              TIMESTAMP(3),
  "lastErrorCode"            TEXT,
  "lastErrorMessage"         TEXT,
  "attemptNumber"            INTEGER     NOT NULL DEFAULT 1,
  CONSTRAINT "ActivityBookingAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ActivityBookingAttempt_activityBookingId_idx"
  ON "ActivityBookingAttempt"("activityBookingId");

CREATE INDEX IF NOT EXISTS "ActivityBookingAttempt_partnerBookingReference_idx"
  ON "ActivityBookingAttempt"("partnerBookingReference");

CREATE INDEX IF NOT EXISTS "ActivityBookingAttempt_supplierBookingReference_idx"
  ON "ActivityBookingAttempt"("supplierBookingReference");

-- 4. Auto-update updatedAt on ActivityBookingAttempt
CREATE OR REPLACE FUNCTION update_activity_booking_attempt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_booking_attempt_updated_at ON "ActivityBookingAttempt";
CREATE TRIGGER activity_booking_attempt_updated_at
  BEFORE UPDATE ON "ActivityBookingAttempt"
  FOR EACH ROW EXECUTE FUNCTION update_activity_booking_attempt_updated_at();

-- 5. Index for reconciliation queries (stale bookings lookup)
CREATE INDEX IF NOT EXISTS "ActivityBooking_status_supplierConfirmingAt_idx"
  ON "ActivityBooking"("status", "supplierConfirmingAt");
