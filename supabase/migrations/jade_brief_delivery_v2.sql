-- Extend BriefDeliveryLog with email delivery status tracking
-- Run in Supabase SQL Editor

ALTER TABLE "BriefDeliveryLog"
  ADD COLUMN IF NOT EXISTS "status"            TEXT        NOT NULL DEFAULT 'SENT',
  ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "failureReason"     TEXT,
  ADD COLUMN IF NOT EXISTS "sentAt"            TIMESTAMPTZ;

-- Backfill existing rows (all previously inserted rows are successful deliveries)
UPDATE "BriefDeliveryLog" SET "status" = 'SENT' WHERE "status" IS NULL OR "status" = '';

CREATE INDEX IF NOT EXISTS "BriefDeliveryLog_status_idx" ON "BriefDeliveryLog" ("status");
