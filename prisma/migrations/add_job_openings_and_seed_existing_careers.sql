-- Careers management: JobOpening table + seed of the four existing listings
-- + EmailMessage.attachments for the careers inbound flow.
-- Run ONCE in the Supabase SQL editor (this repo's production migration
-- convention). Idempotent — safe to re-run; seeds use fixed ids with
-- ON CONFLICT DO NOTHING so duplicates are impossible.

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

-- Seed: the four listings currently hardcoded on /careers — text, type,
-- location and order preserved exactly.
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

-- Careers inbound: attachment metadata on Email Hub messages (additive)
ALTER TABLE "EmailMessage"
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]';

SELECT 'careers ready — ' || count(*)::text || ' openings' AS result FROM "JobOpening";
