-- Recruitment Hub Release 2 — candidates, applications, answers, documents,
-- stage history. Run ONCE in the Supabase SQL editor after the R1 migration.
-- Idempotent — safe to re-run. History is delete-protected (RESTRICT).

CREATE TABLE IF NOT EXISTS "Candidate" (
  id             text PRIMARY KEY,
  email          text NOT NULL UNIQUE,
  "firstName"    text NOT NULL,
  "lastName"     text NOT NULL,
  phone          text,
  country        text,
  city           text,
  "linkedinUrl"  text,
  "portfolioUrl" text,
  source         text NOT NULL DEFAULT 'website',
  tags           jsonb NOT NULL DEFAULT '[]',
  "mergedIntoId" text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Candidate_mergedIntoId_idx" ON "Candidate" ("mergedIntoId");

CREATE TABLE IF NOT EXISTS "JobApplication" (
  id                      text PRIMARY KEY,
  reference               text NOT NULL UNIQUE,
  "candidateId"           text NOT NULL REFERENCES "Candidate"(id) ON DELETE RESTRICT,
  "jobId"                 text NOT NULL,
  "stageKey"              text NOT NULL DEFAULT 'new',
  status                  text NOT NULL DEFAULT 'active',
  "coverLetter"           text,
  "howHeard"              text,
  referral                text,
  "workAuthorization"     text,
  accommodation           text,
  source                  text NOT NULL DEFAULT 'website',
  "statusTokenHash"       text,
  "statusTokenExpiresAt"  timestamptz,
  "consentPrivacyVersion" text,
  "consentAiVersion"      text,
  "consentAt"             timestamptz,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("candidateId", "jobId")
);
CREATE INDEX IF NOT EXISTS "JobApplication_jobId_stageKey_idx" ON "JobApplication" ("jobId", "stageKey");
CREATE INDEX IF NOT EXISTS "JobApplication_reference_idx"      ON "JobApplication" (reference);

CREATE TABLE IF NOT EXISTS "ApplicationAnswer" (
  id              text PRIMARY KEY,
  "applicationId" text NOT NULL REFERENCES "JobApplication"(id) ON DELETE CASCADE,
  "questionId"    text,
  question        text NOT NULL,
  answer          text NOT NULL
);
CREATE INDEX IF NOT EXISTS "ApplicationAnswer_applicationId_idx" ON "ApplicationAnswer" ("applicationId");

CREATE TABLE IF NOT EXISTS "CandidateDocument" (
  id              text PRIMARY KEY,
  "candidateId"   text NOT NULL REFERENCES "Candidate"(id) ON DELETE RESTRICT,
  "applicationId" text REFERENCES "JobApplication"(id) ON DELETE SET NULL,
  kind            text NOT NULL DEFAULT 'cv',
  filename        text NOT NULL,
  "contentType"   text NOT NULL,
  size            integer NOT NULL DEFAULT 0,
  "storagePath"   text NOT NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CandidateDocument_candidateId_idx"   ON "CandidateDocument" ("candidateId");
CREATE INDEX IF NOT EXISTS "CandidateDocument_applicationId_idx" ON "CandidateDocument" ("applicationId");

CREATE TABLE IF NOT EXISTS "ApplicationStageHistory" (
  id              text PRIMARY KEY,
  "applicationId" text NOT NULL REFERENCES "JobApplication"(id) ON DELETE CASCADE,
  "fromKey"       text,
  "toKey"         text NOT NULL,
  "movedBy"       text,
  note            text,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ApplicationStageHistory_app_created_idx"
  ON "ApplicationStageHistory" ("applicationId", "createdAt");

SELECT 'recruitment R2 ready' AS result;
