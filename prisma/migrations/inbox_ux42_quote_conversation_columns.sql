-- ============================================================
-- INBOX UX-4.2 — CREATE QUOTE columns on "quotes"
-- (idempotent, hand-run in the Supabase SQL Editor — NEVER prisma db push;
--  after running, only `npx prisma generate` is needed locally.)
--
-- The Client Action Centre's Create Quote action REUSES the existing
-- quotes engine (POST /api/admin/quotes). These columns are ADDITIVE and
-- NULLABLE: they attach a quote to the Inbox conversation it was created
-- from and record the creating feature. No existing rows or writers change.
--
-- NOTE ON NAMING: the Prisma Quote model is @@map("quotes") with
-- snake_case column maps (client_name, valid_until, …), so these columns
-- follow the table's own convention: "conversation_id" and "source" on
-- table "quotes" (NOT "conversationId" on a "Quote" table — that table
-- does not exist). Prisma model fields stay camelCase via @map.
-- ============================================================

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "conversation_id" integer;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "source"          text;

-- Partial index — only Action-Centre quotes carry a conversation.
CREATE INDEX IF NOT EXISTS idx_quotes_conversation
  ON "quotes" ("conversation_id")
  WHERE "conversation_id" IS NOT NULL;

-- ── Validation ───────────────────────────────────────────────
-- Literal 'inbox_ux42' column makes a zero-count visibly a RESULT.
SELECT
  'inbox_ux42' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'quotes'
       AND column_name IN ('conversation_id','source'))                 AS new_columns,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_quotes_conversation')                       AS idx_conversation,
  (SELECT COUNT(*) FROM information_schema.table_constraints
     WHERE table_name = 'quotes' AND constraint_type = 'PRIMARY KEY')   AS pk_intact;
-- Expect: inbox_ux42 | 2 | 1 | 1
