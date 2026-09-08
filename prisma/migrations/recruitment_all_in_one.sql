-- Recruitment Hub Release 1 — extend JobOpening + screening questions +
-- pipeline stages. Upgrade-safe: works whether or not the earlier minimal
-- careers migration (add_job_openings_and_seed_existing_careers.sql) ran.
-- Run ONCE in the Supabase SQL editor. Idempotent — safe to re-run.

-- ── 0. Base table (no-op if the earlier migration already created it) ────────
CREATE TABLE IF NOT EXISTS "JobOpening" (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  type          text NOT NULL,
  location      text NOT NULL,
  description   text NOT NULL,
  "isActive"    boolean NOT NULL DEFAULT true,
  "sortOrder"   integer NOT NULL DEFAULT 0,
  "createdBy"   text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "JobOpening_isActive_idx" ON "JobOpening" ("isActive");

-- Seed the original four (no-op when already present)
INSERT INTO "JobOpening" (id, title, type, location, description, "isActive", "sortOrder", "createdBy")
VALUES
  ('job_visa_specialist', 'Visa Application Specialist', 'Full-time', 'London, UK (Hybrid)',
   'Prepare visa applications, liaise with embassies and coach clients through the interview process. 2+ years visa processing experience required.',
   true, 1, 'migration'),
  ('job_travel_consultant', 'Travel Consultant', 'Full-time', 'Remote (UK/Nigeria)',
   'Research and book bespoke itineraries for our clients. Strong knowledge of Sabre GDS or Amadeus and luxury travel experience preferred.',
   true, 2, 'migration'),
  ('job_customer_success', 'Customer Success Agent', 'Full-time', 'Remote',
   'First point of contact for clients via WhatsApp and email. Resolve booking queries, escalate issues and ensure every client has an exceptional experience.',
   true, 3, 'migration'),
  ('job_frontend_engineer', 'Frontend Engineer', 'Contract', 'Remote',
   'Build and maintain walztravels.com — Next.js 14, TypeScript, Tailwind, GSAP. You''ll work directly with the founding team.',
   true, 4, 'migration')
ON CONFLICT (id) DO NOTHING;

-- ── 1. Extended columns (all additive) ───────────────────────────────────────
ALTER TABLE "JobOpening"
  ADD COLUMN IF NOT EXISTS slug                       text,
  ADD COLUMN IF NOT EXISTS "jobRef"                   text,
  ADD COLUMN IF NOT EXISTS department                 text,
  ADD COLUMN IF NOT EXISTS "workplaceType"            text NOT NULL DEFAULT 'remote',
  ADD COLUMN IF NOT EXISTS "compensationType"         text NOT NULL DEFAULT 'salary',
  ADD COLUMN IF NOT EXISTS "compensationMin"          numeric(12,2),
  ADD COLUMN IF NOT EXISTS "compensationMax"          numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency                   text NOT NULL DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS responsibilities           text,
  ADD COLUMN IF NOT EXISTS requirements               text,
  ADD COLUMN IF NOT EXISTS benefits                   text,
  ADD COLUMN IF NOT EXISTS "applicationInstructions"  text,
  ADD COLUMN IF NOT EXISTS deadline                   timestamptz,
  ADD COLUMN IF NOT EXISTS status                     text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "hiringManager"            text,
  ADD COLUMN IF NOT EXISTS recruiters                 jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS positions                  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "screeningSettings"        jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "aiDisclosure"             text,
  ADD COLUMN IF NOT EXISTS "publishedAt"              timestamptz,
  ADD COLUMN IF NOT EXISTS "archivedAt"               timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "JobOpening_slug_key"   ON "JobOpening" (slug)     WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "JobOpening_jobRef_key" ON "JobOpening" ("jobRef") WHERE "jobRef" IS NOT NULL;
CREATE INDEX        IF NOT EXISTS "JobOpening_status_idx" ON "JobOpening" (status);

-- ── 2. Backfill legacy rows: publish actives, hide inactives, fixed slugs ────
UPDATE "JobOpening" SET status = 'published', "publishedAt" = COALESCE("publishedAt", "createdAt")
WHERE status = 'draft' AND "isActive" = true;
UPDATE "JobOpening" SET status = 'paused'
WHERE status = 'draft' AND "isActive" = false;

UPDATE "JobOpening" SET slug = 'visa-application-specialist' WHERE id = 'job_visa_specialist'  AND slug IS NULL;
UPDATE "JobOpening" SET slug = 'travel-consultant'           WHERE id = 'job_travel_consultant' AND slug IS NULL;
UPDATE "JobOpening" SET slug = 'customer-success-agent'      WHERE id = 'job_customer_success'  AND slug IS NULL;
UPDATE "JobOpening" SET slug = 'frontend-engineer'           WHERE id = 'job_frontend_engineer' AND slug IS NULL;
-- Any other legacy rows: derive slug from title
UPDATE "JobOpening"
SET slug = lower(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) || '-' || substr(id, 5, 6)
WHERE slug IS NULL;

-- ── 3. Screening questions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "JobScreeningQuestion" (
  id          text PRIMARY KEY,
  "jobId"     text NOT NULL REFERENCES "JobOpening"(id) ON DELETE CASCADE,
  question    text NOT NULL,
  kind        text NOT NULL DEFAULT 'text',
  required    boolean NOT NULL DEFAULT false,
  options     jsonb NOT NULL DEFAULT '[]',
  "sortOrder" integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "JobScreeningQuestion_jobId_idx" ON "JobScreeningQuestion" ("jobId");

-- ── 4. Pipeline stages (stable keys; labels customizable) ────────────────────
CREATE TABLE IF NOT EXISTS "JobPipelineStage" (
  id          text PRIMARY KEY,
  "jobId"     text NOT NULL REFERENCES "JobOpening"(id) ON DELETE CASCADE,
  key         text NOT NULL,
  label       text NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isSystem"  boolean NOT NULL DEFAULT true,
  UNIQUE ("jobId", key)
);
CREATE INDEX IF NOT EXISTS "JobPipelineStage_jobId_sortOrder_idx" ON "JobPipelineStage" ("jobId", "sortOrder");

-- Seed default stages for every existing job (idempotent per (jobId, key))
INSERT INTO "JobPipelineStage" (id, "jobId", key, label, "sortOrder", "isSystem")
SELECT j.id || '_' || s.key, j.id, s.key, s.label, s.ord, true
FROM "JobOpening" j
CROSS JOIN (VALUES
  ('new',                 'New Application',        1),
  ('ai_review',           'AI Review Completed',    2),
  ('recruiter_review',    'Recruiter Review',       3),
  ('shortlisted',         'Shortlisted',            4),
  ('ai_interview_invited','AI Interview Invited',   5),
  ('ai_interview_done',   'AI Interview Completed', 6),
  ('human_interview',     'Human Interview',        7),
  ('reference_check',     'Reference Check',        8),
  ('offer',               'Offer',                  9),
  ('hired',               'Hired',                 10),
  ('rejected',            'Rejected',              11),
  ('talent_pool',         'Talent Pool',           12)
) AS s(key, label, ord)
ON CONFLICT ("jobId", key) DO NOTHING;

SELECT 'recruitment R1 ready — ' || count(*)::text || ' jobs, slugs set' AS result
FROM "JobOpening" WHERE slug IS NOT NULL;
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
-- ══════════════════════════════════════════════════════════════════════════
-- Walz Recruitment Hub — Release 8: communication templates
-- Run manually in the Supabase SQL editor. Idempotent; safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "RecruitmentEmailTemplate" (
  "id"        TEXT PRIMARY KEY,
  "key"       TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "subject"   TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecruitmentEmailTemplate_key_key"
  ON "RecruitmentEmailTemplate"("key");

-- Seed default templates (edit freely in the admin afterwards; re-running
-- this file never overwrites your edits).
INSERT INTO "RecruitmentEmailTemplate" ("id", "key", "name", "subject", "body", "isActive", "createdAt", "updatedAt") VALUES
(
  'ret_under_review', 'under_review', 'Application progressing',
  'Your {{jobTitle}} application is progressing ({{reference}})',
  E'Dear {{firstName}},\n\nThank you for your patience. Your application for the {{jobTitle}} role (reference {{reference}}) has progressed to the next stage of our review, and a member of our team will contact you about the next steps soon.\n\nYou can check your application status any time using the link from your confirmation email.\n\nKind regards,\n{{senderName}}\n{{companyName}}',
  TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'ret_request_more_info', 'request_more_info', 'Request more information',
  'A quick question about your {{jobTitle}} application ({{reference}})',
  E'Dear {{firstName}},\n\nThank you for applying for the {{jobTitle}} role (reference {{reference}}). To continue reviewing your application, we need a little more information from you.\n\n[Describe what you need here before sending.]\n\nSimply reply to this email with the details and we will pick your application straight back up.\n\nKind regards,\n{{senderName}}\n{{companyName}}',
  TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'ret_rejection_after_review', 'rejection_after_review', 'Rejection after human review',
  'Update on your {{jobTitle}} application ({{reference}})',
  E'Dear {{firstName}},\n\nThank you for the time and care you put into your application for the {{jobTitle}} role (reference {{reference}}), and for your interest in {{companyName}}.\n\nAfter careful review by our recruitment team, we have decided not to move forward with your application on this occasion. This was a considered decision made by our staff, and it reflects the strength of the field rather than any single shortcoming.\n\nWe would be glad to keep your details on file and contact you if a role matching your experience opens up. If you would rather we did not, just reply to this email and we will remove them.\n\nWe wish you every success in your search.\n\nKind regards,\n{{senderName}}\n{{companyName}}',
  TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'ret_talent_pool_added', 'talent_pool_added', 'Added to talent pool',
  'Keeping in touch — {{companyName}} opportunities',
  E'Dear {{firstName}},\n\nThank you again for applying for the {{jobTitle}} role (reference {{reference}}). While we did not have a matching opening this time, our team was impressed by your profile and we have added you to our talent pool.\n\nThis means we will reach out directly when a suitable role opens. If you would prefer not to be contacted about future opportunities, just reply to this email and we will remove your details.\n\nKind regards,\n{{senderName}}\n{{companyName}}',
  TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Done. Verify with:
--   SELECT key, name FROM "RecruitmentEmailTemplate" ORDER BY key;
-- ══════════════════════════════════════════════════════════════════════════
-- Walz Recruitment Hub — Release 9: offers & talent pools
-- Run manually in the Supabase SQL editor. Idempotent; safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "JobOffer" (
  "id"                 TEXT PRIMARY KEY,
  "applicationId"      TEXT NOT NULL REFERENCES "JobApplication"("id") ON DELETE CASCADE,
  "status"             TEXT NOT NULL DEFAULT 'draft',
  "jobTitle"           TEXT NOT NULL,
  "compensationType"   TEXT NOT NULL DEFAULT 'salary',
  "compensationAmount" DECIMAL(12,2),
  "currency"           TEXT NOT NULL DEFAULT 'NGN',
  "compensationNotes"  TEXT,
  "startDate"          TIMESTAMP(3),
  "terms"              TEXT,
  "tokenHash"          TEXT,
  "tokenExpiresAt"     TIMESTAMP(3),
  "createdBy"          TEXT NOT NULL,
  "sentAt"             TIMESTAMP(3),
  "respondedAt"        TIMESTAMP(3),
  "candidateNote"      TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "JobOffer_tokenHash_key" ON "JobOffer"("tokenHash");
CREATE INDEX IF NOT EXISTS "JobOffer_applicationId_createdAt_idx"
  ON "JobOffer"("applicationId", "createdAt");

CREATE TABLE IF NOT EXISTS "TalentPoolEntry" (
  "id"                  TEXT PRIMARY KEY,
  "candidateId"         TEXT NOT NULL,
  "addedBy"             TEXT NOT NULL,
  "reason"              TEXT,
  "tags"                JSONB NOT NULL DEFAULT '[]',
  "sourceApplicationId" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "TalentPoolEntry_candidateId_key"
  ON "TalentPoolEntry"("candidateId");
CREATE INDEX IF NOT EXISTS "TalentPoolEntry_createdAt_idx" ON "TalentPoolEntry"("createdAt");

-- Done. Verify with:
--   SELECT count(*) FROM "JobOffer"; SELECT count(*) FROM "TalentPoolEntry";
