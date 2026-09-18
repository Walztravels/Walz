-- ============================================================
-- INBOX UX-4.3 — VISA FORM columns on "VisaApplicationToken" and
-- "DocumentRequest" (idempotent, hand-run in the Supabase SQL Editor —
-- NEVER prisma db push; after running, only `npx prisma generate`).
--
-- The Client Action Centre's Visa Form action REUSES the existing visa
-- infrastructure (VisaApplication, VisaApplicationToken, DocumentRequest)
-- end to end. These columns are ADDITIVE and NULLABLE: they attach a
-- token/document-request to the Inbox conversation it was generated from,
-- so the Client Action Centre can list "recent visa actions for this
-- conversation" the same way Request Payment and Create Quote already do.
-- No existing rows or writers (the admin visa-applications UI, the
-- document-requests admin UI) change.
-- ============================================================

ALTER TABLE "VisaApplicationToken" ADD COLUMN IF NOT EXISTS "conversationId" integer;
ALTER TABLE "VisaApplicationToken" ADD COLUMN IF NOT EXISTS "source"         text;

ALTER TABLE "DocumentRequest" ADD COLUMN IF NOT EXISTS "conversationId" integer;
ALTER TABLE "DocumentRequest" ADD COLUMN IF NOT EXISTS "source"         text;

CREATE INDEX IF NOT EXISTS idx_visa_application_token_conversation
  ON "VisaApplicationToken" ("conversationId")
  WHERE "conversationId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_request_conversation
  ON "DocumentRequest" ("conversationId")
  WHERE "conversationId" IS NOT NULL;

-- ── Validation ───────────────────────────────────────────────
SELECT
  'inbox_ux43' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'VisaApplicationToken'
       AND column_name IN ('conversationId','source'))                   AS token_columns,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'DocumentRequest'
       AND column_name IN ('conversationId','source'))                   AS docreq_columns,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_visa_application_token_conversation')        AS idx_token,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_document_request_conversation')              AS idx_docreq;
-- Expect: inbox_ux43 | 2 | 2 | 1 | 1
