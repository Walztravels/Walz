-- ============================================================
-- INBOX UX-4.1C — CLIENT REFERENCE column on "ConversationClientLink"
-- (idempotent, hand-run in the Supabase SQL Editor — NEVER prisma db push;
--  after running, only `npx prisma generate` is needed locally.)
--
-- UX-4.1C extends the SAME identity surface introduced in UX-4.1A
-- (ConversationClientLink) rather than creating a second identity system.
-- First-time and legacy customers who are LINKED (not VERIFIED via an
-- existing VisaApplication) still need a stable client-facing reference
-- for display ("Linked / Vicky M. / WALZ-C-XXXXXX"). Rather than adding
-- a reference column to User/ClientAccount/Lead (three separate,
-- widely-used production models), the reference lives on the LINK row:
--   - when the link resolves to an entity that already has a WALZ
--     reference somewhere (a VisaApplication), that reference is reused
--     — never regenerated;
--   - otherwise ONE reference is generated at link time and persisted
--     here, so re-reading the same conversation's link is stable.
-- ============================================================

ALTER TABLE "ConversationClientLink" ADD COLUMN IF NOT EXISTS "clientReference" text;

-- ── Validation ───────────────────────────────────────────────
SELECT
  'inbox_ux41c' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'ConversationClientLink'
       AND column_name = 'clientReference')                                AS new_column,
  (SELECT COUNT(*) FROM information_schema.table_constraints
     WHERE table_name = 'ConversationClientLink' AND constraint_type = 'PRIMARY KEY') AS pk_intact;
-- Expect: inbox_ux41c | 1 | 1
