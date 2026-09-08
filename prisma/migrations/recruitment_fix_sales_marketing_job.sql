-- ══════════════════════════════════════════════════════════════════════════
-- Careers data fix — Sales & Marketing Representative job record
-- Run manually in the Supabase SQL editor. Idempotent; safe to re-run.
--
-- 1. Location:  'NIG/GH/'  →  'Nigeria & Ghana'  (renders "Nigeria & Ghana · Remote")
-- 2. How-to-apply text: replaces the copy that pointed applicants at the
--    general /careers page with on-page apply instructions.
-- 3. Screening questions: seeds the role-specific set (only questions whose
--    topic is not already covered are inserted — nothing is duplicated).
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Location (admin + public + JSON-LD all read this column)
UPDATE "JobOpening"
SET "location" = 'Nigeria & Ghana'
WHERE "slug" = 'sales-marketing-representative-o38270'
  AND "location" IS DISTINCT FROM 'Nigeria & Ghana';

-- 2. How to apply (shown on the job page; no raw /careers URL)
UPDATE "JobOpening"
SET "applicationInstructions" =
  'Click Apply Now below to complete the online application and upload your current CV. Please ensure your contact information is accurate. Only shortlisted candidates will be contacted.'
WHERE "slug" = 'sales-marketing-representative-o38270';

-- Also strip any leftover careers-page URL lines from the description body
UPDATE "JobOpening"
SET "description" = trim(regexp_replace("description",
  '^.*(walztravels\.com/careers|visit our careers page).*$', '', 'gin'))
WHERE "slug" = 'sales-marketing-representative-o38270'
  AND "description" ~* '(walztravels\.com/careers|visit our careers page)';

-- 3. Role-specific screening questions (topic-guarded, order 1–8)
WITH job AS (
  SELECT id FROM "JobOpening" WHERE "slug" = 'sales-marketing-representative-o38270'
),
new_questions (qkey, question, kind, required, sort) AS (
  VALUES
    ('sales_experience', 'Describe your previous sales or marketing experience, including what you sold and your results.', 'text', true, 1),
    ('client_sourcing',  'How would you find and approach new travel clients (flights, visas, holiday packages)?',          'text', true, 2),
    ('objection',        'A potential client says our prices look higher than an online competitor. How do you handle that objection?', 'text', true, 3),
    ('follow_up',        'How do you follow up with leads who showed interest but did not buy immediately?',                'text', true, 4),
    ('whatsapp_social',  'What experience do you have using WhatsApp and social media to generate or close sales?',        'text', true, 5),
    ('commission',       'This role is commission-based, with earnings tied directly to your sales. Do you understand and accept this?', 'boolean', true, 6),
    ('availability',     'When are you available to start, and how many hours per week can you commit?',                   'text', true, 7),
    ('location',         'Which country and city are you based in?',                                                       'text', true, 8)
)
INSERT INTO "JobScreeningQuestion" ("id", "jobId", "question", "kind", "required", "options", "sortOrder")
SELECT job.id || '_sq_' || nq.qkey, job.id, nq.question, nq.kind, nq.required, '[]'::jsonb, nq.sort
FROM job CROSS JOIN new_questions nq
WHERE NOT EXISTS (                                  -- id-idempotent (re-runs)
  SELECT 1 FROM "JobScreeningQuestion" q
  WHERE q."id" = job.id || '_sq_' || nq.qkey
)
AND NOT EXISTS (                                    -- topic-guarded (no duplicates
  SELECT 1 FROM "JobScreeningQuestion" q            --  of manually added questions)
  WHERE q."jobId" = job.id
    AND (
      (nq.qkey = 'sales_experience' AND q.question ILIKE '%sales%experience%') OR
      (nq.qkey = 'client_sourcing'  AND (q.question ILIKE '%source%client%' OR q.question ILIKE '%find%client%')) OR
      (nq.qkey = 'objection'        AND q.question ILIKE '%objection%') OR
      (nq.qkey = 'follow_up'        AND q.question ILIKE '%follow%up%') OR
      (nq.qkey = 'whatsapp_social'  AND (q.question ILIKE '%whatsapp%' OR q.question ILIKE '%social media%')) OR
      (nq.qkey = 'commission'       AND q.question ILIKE '%commission%') OR
      (nq.qkey = 'availability'     AND (q.question ILIKE '%available%' OR q.question ILIKE '%availability%')) OR
      (nq.qkey = 'location'         AND (q.question ILIKE '%country%' OR q.question ILIKE '%based%'))
    )
);

-- Verify:
SELECT "location", "applicationInstructions" FROM "JobOpening"
WHERE "slug" = 'sales-marketing-representative-o38270';
SELECT q."sortOrder", q."kind", q."required", q."question" FROM "JobScreeningQuestion" q
JOIN "JobOpening" j ON j.id = q."jobId"
WHERE j."slug" = 'sales-marketing-representative-o38270'
ORDER BY q."sortOrder";
