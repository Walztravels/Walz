-- ============================================================
-- Run this in Supabase SQL Editor, then: npx prisma generate
-- ============================================================

-- 1. ClientAccount — client portal accounts
CREATE TABLE IF NOT EXISTS "ClientAccount" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"        TEXT UNIQUE NOT NULL,
  "name"         TEXT NOT NULL,
  "phone"        TEXT,
  "passwordHash" TEXT,
  "isVerified"   BOOLEAN DEFAULT false,
  "createdAt"    TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE "ClientAccount" DISABLE ROW LEVEL SECURITY;

-- 2. Extend VisaApplication with client portal + timeline fields
ALTER TABLE "VisaApplication"
  ADD COLUMN IF NOT EXISTS "clientAccountId" UUID REFERENCES "ClientAccount"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "statusMessage"   TEXT,
  ADD COLUMN IF NOT EXISTS "timeline"        JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_visa_client_account ON "VisaApplication"("clientAccountId");

-- 3. FlightAlert — price drop notification subscriptions
CREATE TABLE IF NOT EXISTS "FlightAlert" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"        TEXT NOT NULL,
  "name"         TEXT,
  "origin"       TEXT NOT NULL,
  "destination"  TEXT NOT NULL,
  "targetPrice"  DECIMAL,
  "currency"     TEXT DEFAULT 'GBP',
  "cabinClass"   TEXT DEFAULT 'economy',
  "currentPrice" DECIMAL,
  "lastChecked"  TIMESTAMPTZ,
  "active"       BOOLEAN DEFAULT true,
  "alertSent"    BOOLEAN DEFAULT false,
  "createdAt"    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE "FlightAlert" DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_flight_alert_email  ON "FlightAlert"("email");
CREATE INDEX IF NOT EXISTS idx_flight_alert_active ON "FlightAlert"("active", "alertSent");

-- ============================================================
-- Abandonment Capture (run in Supabase SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS "AbandonedSession" (
  "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"     TEXT,
  "name"      TEXT,
  "type"      TEXT NOT NULL,
  "data"      JSONB DEFAULT '{}',
  "step"      TEXT,
  "emailSent" BOOLEAN DEFAULT false,
  "converted" BOOLEAN DEFAULT false,
  "source"    TEXT DEFAULT 'web',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE "AbandonedSession" DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "AbandonedSession_email_idx" ON "AbandonedSession" ("email");
CREATE INDEX IF NOT EXISTS "AbandonedSession_type_idx"  ON "AbandonedSession" ("type", "createdAt");
