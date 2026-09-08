-- ══════════════════════════════════════════════════════════════════════════
-- Walz Recruitment Hub — Release 6: human-reviewed AI résumé screening
-- Run manually in the Supabase SQL editor. Idempotent; safe to re-run.
-- Requires: recruitment R1–R2 migrations already applied.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "AiScreeningResult" (
  "id"                 TEXT PRIMARY KEY,
  "applicationId"      TEXT NOT NULL REFERENCES "JobApplication"("id") ON DELETE CASCADE,
  "model"              TEXT NOT NULL,
  "promptVersion"      TEXT NOT NULL DEFAULT '2026-09',
  "status"             TEXT NOT NULL DEFAULT 'completed',
  "summary"            TEXT,
  "strengths"          JSONB NOT NULL DEFAULT '[]',
  "concerns"           JSONB NOT NULL DEFAULT '[]',
  "suggestedQuestions" JSONB NOT NULL DEFAULT '[]',
  "matchScore"         INTEGER,
  "cvUsed"             BOOLEAN NOT NULL DEFAULT FALSE,
  "error"              TEXT,
  "requestedBy"        TEXT NOT NULL,
  "reviewedBy"         TEXT,
  "reviewedAt"         TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AiScreeningResult_applicationId_createdAt_idx"
  ON "AiScreeningResult"("applicationId", "createdAt");

-- Done. Verify with:
--   SELECT count(*) FROM "AiScreeningResult";
