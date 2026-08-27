-- Release 1.1: Measurement Hardening patch
-- Run in Supabase SQL Editor AFTER release1_commercial.sql

-- 1. Extend CommercialEvent with bookingId + eventId (dedup key)
ALTER TABLE "CommercialEvent"
  ADD COLUMN IF NOT EXISTS "bookingId" TEXT,
  ADD COLUMN IF NOT EXISTS "eventId"   TEXT;

CREATE INDEX IF NOT EXISTS "CommercialEvent_bookingId_idx" ON "CommercialEvent" ("bookingId");
CREATE INDEX IF NOT EXISTS "CommercialEvent_eventId_idx"   ON "CommercialEvent" ("eventId");

-- 2. Add Jade attribution fields to Lead
ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "jadeAssisted"    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "jadeQualifiedAt" TIMESTAMPTZ;

-- 3. Verify
SELECT 'CommercialEvent.bookingId added' AS status
WHERE EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'CommercialEvent' AND column_name = 'bookingId')
UNION ALL
SELECT 'CommercialEvent.eventId added'
WHERE EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'CommercialEvent' AND column_name = 'eventId')
UNION ALL
SELECT 'Lead.jadeAssisted added'
WHERE EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'Lead' AND column_name = 'jadeAssisted');
