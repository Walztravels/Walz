-- ══════════════════════════════════════════════════════════════════════════
-- Walz Recruitment Hub — Release 7: secure AI screening interviews
-- Run manually in the Supabase SQL editor. Idempotent; safe to re-run.
-- Requires: recruitment R1–R2 migrations already applied.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "AiInterviewQuestionSet" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "jobId"     TEXT,
  "questions" JSONB NOT NULL DEFAULT '[]',
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiInterviewQuestionSet_jobId_idx" ON "AiInterviewQuestionSet"("jobId");

CREATE TABLE IF NOT EXISTS "AiInterview" (
  "id"             TEXT PRIMARY KEY,
  "applicationId"  TEXT NOT NULL REFERENCES "JobApplication"("id") ON DELETE CASCADE,
  "tokenHash"      TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'invited',
  "questionSetId"  TEXT REFERENCES "AiInterviewQuestionSet"("id") ON DELETE SET NULL,
  "questions"      JSONB NOT NULL DEFAULT '[]',
  "currentIndex"   INTEGER NOT NULL DEFAULT 0,
  "transcript"     JSONB NOT NULL DEFAULT '[]',
  "aiSummary"      TEXT,
  "aiHighlights"   JSONB NOT NULL DEFAULT '[]',
  "reviewedBy"     TEXT,
  "reviewedAt"     TIMESTAMP(3),
  "invitedBy"      TEXT NOT NULL,
  "startedAt"      TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiInterview_tokenHash_key" ON "AiInterview"("tokenHash");
CREATE INDEX IF NOT EXISTS "AiInterview_applicationId_createdAt_idx"
  ON "AiInterview"("applicationId", "createdAt");

-- Seed: 10 questions for the commission-based Sales & Marketing Representative.
INSERT INTO "AiInterviewQuestionSet" ("id", "name", "jobId", "questions", "isActive", "createdAt", "updatedAt")
VALUES (
  'qs_sales_marketing_rep',
  'Sales & Marketing Representative',
  NULL,
  '[
    {"key":"q1_experience","question":"Describe your previous sales or marketing experience, including the products or services you sold and your results."},
    {"key":"q2_commission","question":"This role is commission-based. How do you plan and manage your income and motivation under a commission structure?"},
    {"key":"q3_sourcing","question":"How would you find and approach new clients for travel services such as flights, visas and holiday packages?"},
    {"key":"q4_persuasion","question":"Describe a time you persuaded a hesitant customer to make a purchase. What exactly did you say or do?"},
    {"key":"q5_industry","question":"What do you know about the travel industry and the services a travel agency like Walz Travels offers?"},
    {"key":"q6_follow_up","question":"How do you follow up with potential clients who showed interest but did not buy immediately?"},
    {"key":"q7_channels","question":"Which social media or marketing channels would you use to promote travel deals, and why those?"},
    {"key":"q8_objections","question":"A client says our prices are higher than a competitor they found online. How do you respond?"},
    {"key":"q9_targets","question":"What weekly sales activity targets would you set for yourself in your first three months, and how would you hit them?"},
    {"key":"q10_motivation","question":"Why do you want to work with Walz Travels, and what makes you a strong fit for a commission-based role?"}
  ]'::jsonb,
  TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

-- Done. Verify with:
--   SELECT id, name, jsonb_array_length(questions) FROM "AiInterviewQuestionSet";
