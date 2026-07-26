-- Migration: add break windows, per-staff deduction override, notification log
-- Run this in the Supabase SQL editor.

-- 1. Break window columns on Staff
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "breakStartHour" INTEGER NOT NULL DEFAULT 13;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "breakEndHour"   INTEGER NOT NULL DEFAULT 14;

-- 2. Per-staff deduction override (GHS for Ghana staff, NGN for Lagos staff)
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "deductionOverride" DOUBLE PRECISION;

-- 3. Priscilla is in Africa/Accra (UTC+0) — her break is 12:00 PM–1:00 PM Ghana time
UPDATE "Staff" SET "breakStartHour" = 12, "breakEndHour" = 13 WHERE timezone = 'Africa/Accra';

-- 4. NotificationLog — deduplication guard for reminder/miss emails
CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id"      TEXT        NOT NULL,
  "staffId" TEXT        NOT NULL,
  "type"    TEXT        NOT NULL,   -- reminder | pre_break | post_break | miss | mgmt_miss | confirmed
  "slotUtc" TIMESTAMPTZ NOT NULL,
  "sentAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationLog_staffId_type_slotUtc_key"
  ON "NotificationLog"("staffId", "type", "slotUtc");

CREATE INDEX IF NOT EXISTS "NotificationLog_staffId_idx" ON "NotificationLog"("staffId");
CREATE INDEX IF NOT EXISTS "NotificationLog_sentAt_idx"  ON "NotificationLog"("sentAt");

-- 5. RLS: service_role bypasses all policies on the new table
ALTER TABLE "NotificationLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_bypass" ON "NotificationLog"
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
