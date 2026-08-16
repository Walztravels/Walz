-- Email Hub tables
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "EmailThread" (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subject       TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'inbox',
  status        TEXT NOT NULL DEFAULT 'open',
  "assignedTo"  TEXT,
  "lastEmailAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  participants  JSONB NOT NULL DEFAULT '[]',
  "refType"     TEXT,
  "refId"       TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EmailThread_category_status_idx" ON "EmailThread" (category, status, "lastEmailAt" DESC);
CREATE INDEX IF NOT EXISTS "EmailThread_assignedTo_idx" ON "EmailThread" ("assignedTo");
ALTER TABLE "EmailThread" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "EmailMessage" (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "threadId"   TEXT NOT NULL REFERENCES "EmailThread"(id) ON DELETE CASCADE,
  direction    TEXT NOT NULL,
  "from"       TEXT NOT NULL,
  "fromName"   TEXT,
  "to"         JSONB NOT NULL DEFAULT '[]',
  cc           JSONB NOT NULL DEFAULT '[]',
  bcc          JSONB NOT NULL DEFAULT '[]',
  subject      TEXT NOT NULL,
  "bodyHtml"   TEXT NOT NULL,
  "bodyText"   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'sent',
  "sentAt"     TIMESTAMPTZ,
  "receivedAt" TIMESTAMPTZ,
  "readAt"     TIMESTAMPTZ,
  "openCount"  INT NOT NULL DEFAULT 0,
  "resendId"   TEXT,
  "sentBy"     TEXT,
  "inReplyTo"  TEXT,
  "trackingId" TEXT UNIQUE,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EmailMessage_threadId_idx" ON "EmailMessage" ("threadId", "sentAt" DESC);
CREATE INDEX IF NOT EXISTS "EmailMessage_trackingId_idx" ON "EmailMessage" ("trackingId") WHERE "trackingId" IS NOT NULL;
ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
