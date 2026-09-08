-- ══════════════════════════════════════════════════════════════════════════
-- Walz Recruitment Hub — Release 3: applicant tracking pipeline
-- Run manually in the Supabase SQL editor. Idempotent; safe to re-run.
-- Requires: recruitment_r1_job_openings_extended.sql and
--           recruitment_r2_candidates_applications.sql already applied.
-- ══════════════════════════════════════════════════════════════════════════

-- Internal recruiter notes on candidates / applications.
CREATE TABLE IF NOT EXISTS "CandidateNote" (
  "id"            TEXT PRIMARY KEY,
  "candidateId"   TEXT NOT NULL REFERENCES "Candidate"("id") ON DELETE RESTRICT,
  "applicationId" TEXT REFERENCES "JobApplication"("id") ON DELETE SET NULL,
  "authorEmail"   TEXT NOT NULL,
  "authorName"    TEXT,
  "body"          TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CandidateNote_candidateId_createdAt_idx"
  ON "CandidateNote"("candidateId", "createdAt");
CREATE INDEX IF NOT EXISTS "CandidateNote_applicationId_idx"
  ON "CandidateNote"("applicationId");

-- Done. Verify with:
--   SELECT count(*) FROM "CandidateNote";
