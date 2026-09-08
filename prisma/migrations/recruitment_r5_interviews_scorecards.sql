-- ══════════════════════════════════════════════════════════════════════════
-- Walz Recruitment Hub — Release 5: interviews & scorecards
-- Run manually in the Supabase SQL editor. Idempotent; safe to re-run.
-- Requires: recruitment R1–R3 migrations already applied.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "ScorecardTemplate" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "jobId"     TEXT,
  "criteria"  JSONB NOT NULL DEFAULT '[]',
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ScorecardTemplate_jobId_idx" ON "ScorecardTemplate"("jobId");

CREATE TABLE IF NOT EXISTS "Interview" (
  "id"                  TEXT PRIMARY KEY,
  "applicationId"       TEXT NOT NULL REFERENCES "JobApplication"("id") ON DELETE CASCADE,
  "kind"                TEXT NOT NULL DEFAULT 'video',
  "status"              TEXT NOT NULL DEFAULT 'scheduled',
  "scheduledAt"         TIMESTAMP(3),
  "durationMins"        INTEGER NOT NULL DEFAULT 45,
  "location"            TEXT,
  "meetingUrl"          TEXT,
  "interviewers"        JSONB NOT NULL DEFAULT '[]',
  "scorecardTemplateId" TEXT REFERENCES "ScorecardTemplate"("id") ON DELETE SET NULL,
  "notes"               TEXT,
  "createdBy"           TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Interview_applicationId_scheduledAt_idx"
  ON "Interview"("applicationId", "scheduledAt");

CREATE TABLE IF NOT EXISTS "InterviewScorecard" (
  "id"             TEXT PRIMARY KEY,
  "interviewId"    TEXT NOT NULL REFERENCES "Interview"("id") ON DELETE CASCADE,
  "applicationId"  TEXT NOT NULL,
  "reviewerEmail"  TEXT NOT NULL,
  "reviewerName"   TEXT,
  "scores"         JSONB NOT NULL DEFAULT '[]',
  "overallScore"   INTEGER NOT NULL DEFAULT 0,
  "recommendation" TEXT NOT NULL,
  "comment"        TEXT,
  "submittedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "InterviewScorecard_interviewId_reviewerEmail_key"
  ON "InterviewScorecard"("interviewId", "reviewerEmail");
CREATE INDEX IF NOT EXISTS "InterviewScorecard_applicationId_idx"
  ON "InterviewScorecard"("applicationId");

-- Seed: Sales & Marketing Representative scorecard (weights sum to 100).
INSERT INTO "ScorecardTemplate" ("id", "name", "jobId", "criteria", "isActive", "createdAt", "updatedAt")
VALUES (
  'sc_sales_marketing_rep',
  'Sales & Marketing Representative',
  NULL,
  '[
    {"key":"communication","label":"Communication skills","weight":20},
    {"key":"sales_experience","label":"Sales experience","weight":20},
    {"key":"persuasion","label":"Persuasion and objection handling","weight":20},
    {"key":"client_sourcing","label":"Client sourcing ability","weight":15},
    {"key":"travel_industry","label":"Travel-industry knowledge","weight":10},
    {"key":"follow_up","label":"Follow-up discipline","weight":10},
    {"key":"commission_understanding","label":"Understanding of commission model","weight":5}
  ]'::jsonb,
  TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

-- Done. Verify with:
--   SELECT id, name FROM "ScorecardTemplate";
