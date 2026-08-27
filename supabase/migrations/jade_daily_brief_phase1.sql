-- ─── Jade Daily Brief — Phase 1 Migration ────────────────────────────────────
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Enums
DO $$ BEGIN
  CREATE TYPE "AnnouncementCategory" AS ENUM ('NEW_FEATURE','SYSTEM_UPDATE','POLICY','SUPPLIER','IMPORTANT','TRAINING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT','APPROVED','PUBLISHED','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AnnouncementPriority" AS ENUM ('NORMAL','HIGH','URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AnnouncementAudience" AS ENUM ('EVERYONE','SALES','VISA_TEAM','TRAVEL_CONSULTANTS','FINANCE','ADMIN_TEAM','MANAGEMENT','SPECIFIC_ROLE','SPECIFIC_STAFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StaffNotificationCategory" AS ENUM ('JADE_BRIEF','SYSTEM','VISA','TRAVEL','BOOKING','SUPPLIER','MANAGEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StaffAnnouncement
CREATE TABLE IF NOT EXISTS "StaffAnnouncement" (
  "id"               TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "title"            TEXT NOT NULL,
  "category"         "AnnouncementCategory" NOT NULL,
  "summary"          TEXT NOT NULL,
  "detail"           TEXT NOT NULL,
  "whatToDo"         TEXT,
  "effectiveDate"    TIMESTAMPTZ,
  "relevantUrl"      TEXT,
  "audience"         "AnnouncementAudience" NOT NULL DEFAULT 'EVERYONE',
  "audienceRoles"    TEXT[] NOT NULL DEFAULT '{}',
  "audienceStaffIds" TEXT[] NOT NULL DEFAULT '{}',
  "priority"         "AnnouncementPriority" NOT NULL DEFAULT 'NORMAL',
  "status"           "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt"      TIMESTAMPTZ,
  "authorId"         TEXT NOT NULL REFERENCES "Staff"("id"),
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "StaffAnnouncement_status_idx" ON "StaffAnnouncement"("status");
CREATE INDEX IF NOT EXISTS "StaffAnnouncement_publishedAt_idx" ON "StaffAnnouncement"("publishedAt");
CREATE INDEX IF NOT EXISTS "StaffAnnouncement_authorId_idx" ON "StaffAnnouncement"("authorId");

-- JadeDailyBrief
CREATE TABLE IF NOT EXISTS "JadeDailyBrief" (
  "id"                TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "briefDate"         TEXT NOT NULL,
  "motivation"        TEXT NOT NULL,
  "motivationThought" TEXT NOT NULL,
  "motivationTheme"   TEXT NOT NULL,
  "contentJson"       JSONB NOT NULL DEFAULT '{}',
  "generatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "staffReached"      INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "JadeDailyBrief_briefDate_key" UNIQUE ("briefDate")
);
CREATE INDEX IF NOT EXISTS "JadeDailyBrief_briefDate_idx" ON "JadeDailyBrief"("briefDate");

-- StaffNotification
CREATE TABLE IF NOT EXISTS "StaffNotification" (
  "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "staffId"    TEXT NOT NULL REFERENCES "Staff"("id"),
  "category"   "StaffNotificationCategory" NOT NULL DEFAULT 'SYSTEM',
  "title"      TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "data"       JSONB,
  "read"       BOOLEAN NOT NULL DEFAULT FALSE,
  "important"  BOOLEAN NOT NULL DEFAULT FALSE,
  "archived"   BOOLEAN NOT NULL DEFAULT FALSE,
  "sourceId"   TEXT,
  "sourceType" TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "StaffNotification_staffId_read_idx" ON "StaffNotification"("staffId","read");
CREATE INDEX IF NOT EXISTS "StaffNotification_staffId_createdAt_idx" ON "StaffNotification"("staffId","createdAt");
CREATE INDEX IF NOT EXISTS "StaffNotification_staffId_archived_idx" ON "StaffNotification"("staffId","archived");

-- BriefDeliveryLog
CREATE TABLE IF NOT EXISTS "BriefDeliveryLog" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "briefDate"   TEXT NOT NULL,
  "staffId"     TEXT NOT NULL,
  "channel"     TEXT NOT NULL,
  "deliveredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BriefDeliveryLog_briefDate_staffId_channel_key" UNIQUE ("briefDate","staffId","channel")
);
CREATE INDEX IF NOT EXISTS "BriefDeliveryLog_briefDate_idx" ON "BriefDeliveryLog"("briefDate");

-- MotivationHistory
CREATE TABLE IF NOT EXISTS "MotivationHistory" (
  "id"     TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "theme"  TEXT NOT NULL,
  "usedOn" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "MotivationHistory_usedOn_idx" ON "MotivationHistory"("usedOn");
