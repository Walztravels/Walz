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
