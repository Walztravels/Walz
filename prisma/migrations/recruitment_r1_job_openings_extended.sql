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
