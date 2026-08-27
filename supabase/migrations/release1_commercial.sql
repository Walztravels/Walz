-- Release 1: Commercial Event Tracking + Revenue Foundation
-- Run in Supabase SQL Editor

-- 1. CommercialEvent table
CREATE TABLE IF NOT EXISTS "CommercialEvent" (
  "id"          TEXT NOT NULL,
  "event"       TEXT NOT NULL,
  "sessionId"   TEXT,
  "userId"      TEXT,
  "leadId"      TEXT,
  "productType" TEXT,
  "productId"   TEXT,
  "destination" TEXT,
  "currency"    TEXT,
  "amount"      DOUBLE PRECISION,
  "metadata"    JSONB,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CommercialEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommercialEvent_event_idx"     ON "CommercialEvent" ("event");
CREATE INDEX IF NOT EXISTS "CommercialEvent_sessionId_idx" ON "CommercialEvent" ("sessionId");
CREATE INDEX IF NOT EXISTS "CommercialEvent_leadId_idx"    ON "CommercialEvent" ("leadId");
CREATE INDEX IF NOT EXISTS "CommercialEvent_createdAt_idx" ON "CommercialEvent" ("createdAt");

-- 2. CartSession table
CREATE TABLE IF NOT EXISTS "CartSession" (
  "id"          TEXT NOT NULL,
  "sessionId"   TEXT NOT NULL,
  "items"       JSONB NOT NULL DEFAULT '[]',
  "userId"      TEXT,
  "leadId"      TEXT,
  "currency"    TEXT NOT NULL DEFAULT 'GBP',
  "totalAmount" DOUBLE PRECISION,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "abandonedAt" TIMESTAMPTZ,
  "convertedAt" TIMESTAMPTZ,
  CONSTRAINT "CartSession_pkey"       PRIMARY KEY ("id"),
  CONSTRAINT "CartSession_sessionId_key" UNIQUE ("sessionId")
);
CREATE INDEX IF NOT EXISTS "CartSession_sessionId_idx"   ON "CartSession" ("sessionId");
CREATE INDEX IF NOT EXISTS "CartSession_userId_idx"      ON "CartSession" ("userId");
CREATE INDEX IF NOT EXISTS "CartSession_abandonedAt_idx" ON "CartSession" ("abandonedAt");

-- 3. Extend Booking table
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "jadeAssisted" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "leadId"       TEXT,
  ADD COLUMN IF NOT EXISTS "quoteId"      TEXT;

-- Verify
SELECT 'CommercialEvent created' AS status WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'CommercialEvent')
UNION ALL
SELECT 'CartSession created' WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'CartSession')
UNION ALL
SELECT 'Booking.jadeAssisted added' WHERE EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'Booking' AND column_name = 'jadeAssisted');
