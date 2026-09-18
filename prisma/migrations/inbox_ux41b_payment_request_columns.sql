-- ============================================================
-- INBOX UX-4.1B — REQUEST PAYMENT columns on "PaymentLink"
-- (idempotent, hand-run in the Supabase SQL Editor — NEVER prisma db push;
--  after running, only `npx prisma generate` is needed locally.)
--
-- The Client Action Centre's Request Payment action REUSES the existing
-- "PaymentLink" model (created/settled by the existing admin payment-link
-- routes and provider webhooks). These columns are ADDITIVE and NULLABLE:
-- they attach a payment link to the Inbox conversation and the
-- server-resolved client identity (ConversationClientLink / UX-4.1A),
-- and record who requested it. No existing rows or writers change.
-- ============================================================

ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "conversationId"    integer;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "visaApplicationId" text;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "tripId"            text;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "quoteId"           text;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "purpose"           text;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "requestedBy"       text;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "source"            text;
-- Staff-only note — NEVER part of the client-facing description/message.
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "internalNote"      text;

CREATE INDEX IF NOT EXISTS idx_payment_link_conversation
  ON "PaymentLink" ("conversationId")
  WHERE "conversationId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_link_visa_application
  ON "PaymentLink" ("visaApplicationId")
  WHERE "visaApplicationId" IS NOT NULL;

-- ── Validation ───────────────────────────────────────────────
-- Literal 'inbox_ux41b' column makes a zero-count visibly a RESULT.
SELECT
  'inbox_ux41b' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'PaymentLink'
       AND column_name IN ('conversationId','visaApplicationId','tripId',
                           'quoteId','purpose','requestedBy','source',
                           'internalNote'))                                AS new_columns,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_payment_link_conversation')                    AS idx_conversation,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_payment_link_visa_application')                AS idx_application,
  (SELECT COUNT(*) FROM information_schema.table_constraints
     WHERE table_name = 'PaymentLink' AND constraint_type = 'PRIMARY KEY') AS pk_intact,
  -- The idempotency design (deterministic txRef, create-catch-conflict)
  -- DEPENDS on a real DB unique index on txRef. If this is 0, STOP and
  -- report it before deploying UX-4.1B.
  (SELECT COUNT(*) FROM pg_indexes
     WHERE tablename = 'PaymentLink'
       AND indexdef ILIKE '%UNIQUE%'
       AND indexdef ILIKE '%txRef%')                                       AS txref_unique;
-- Expect: inbox_ux41b | 8 | 1 | 1 | 1 | 1
-- (txref_unique = 0 is a DEPLOY BLOCKER — report it, do not push 4.1B.)
