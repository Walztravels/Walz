-- Run this in the Supabase SQL editor (not prisma db push).
-- Creates the CallLog table for Twilio voice call tracking.

CREATE TABLE IF NOT EXISTS "CallLog" (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  "callSid"       TEXT        UNIQUE NOT NULL,
  direction       TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  "from"          TEXT,
  "to"            TEXT,
  status          TEXT,
  duration        INTEGER,
  "assignedTo"    TEXT,
  "assignedToName" TEXT,
  "recordingUrl"  TEXT,
  "createdAt"     TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updatedAt"     TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "CallLog_assignedTo_idx" ON "CallLog" ("assignedTo");
CREATE INDEX IF NOT EXISTS "CallLog_createdAt_idx"  ON "CallLog" ("createdAt" DESC);

-- Enable RLS (row-level security) — admin service role bypasses automatically
ALTER TABLE "CallLog" ENABLE ROW LEVEL SECURITY;

-- Allow the Supabase service role to read/write (used by your server routes)
CREATE POLICY "Service role full access" ON "CallLog"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- After running this SQL, run:  npx prisma generate
-- (do NOT run prisma db push)
