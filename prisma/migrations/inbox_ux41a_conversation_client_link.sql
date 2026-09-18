-- ============================================================
-- INBOX UX-4.1A — CONVERSATION → CLIENT LINK (idempotent, hand-run)
-- Run in the Supabase SQL Editor. NEVER via prisma db push / migrate —
-- after running, only `npx prisma generate` is needed locally.
--
-- Server-authoritative record of which client a Chatwoot conversation
-- belongs to. Written ONLY by the server (service role):
--   * automatically when a Secure Application Lookup verification
--     succeeds (linkMethod otp_verified / fallback_verified), or
--   * explicitly by staff via the admin link endpoint (admin_manual), or
--   * by a webhook backfill job (webhook_backfill).
--
-- APPEND-ONLY philosophy: rows are never deleted. Unlinking or
-- re-linking sets active=false on the old row and inserts a NEW row,
-- preserving the full audit history. Therefore uniqueness is enforced
-- on the ACTIVE row only (partial unique index below) — at most one
-- active link per Chatwoot conversation, unlimited history rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS "ConversationClientLink" (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "chatwootConversationId" integer     NOT NULL,
  -- Nullable identity targets — a link may resolve to any subset of these.
  "supabaseLeadId"         uuid,               -- Supabase leads.id (live inbox lead store)
  "prismaLeadId"           text,               -- Prisma "Lead".id (cuid)
  "userId"                 text,               -- Prisma "User".id (portal account, cuid)
  "clientAccountId"        text,               -- "ClientAccount".id (uuid, kept text for cross-db safety)
  "visaApplicationId"      text,               -- "VisaApplication".id (cuid)
  "linkedBy"               text,               -- staff email that caused the link (null for webhook_backfill)
  "linkMethod"             text        NOT NULL
    CONSTRAINT chk_conversation_client_link_method
    CHECK ("linkMethod" IN ('otp_verified', 'fallback_verified', 'admin_manual', 'webhook_backfill')),
  "verificationId"         text,               -- "ApplicationVerification".id when verification-backed
  "active"                 boolean     NOT NULL DEFAULT true,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedAt"              timestamptz NOT NULL DEFAULT now()
);

-- One ACTIVE link per conversation. Partial unique (WHERE "active") rather
-- than a plain UNIQUE column so the append-only history can hold many
-- inactive rows for the same conversation. This index is also the
-- race-safety gate for the server's create-catch-conflict upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_client_link_active
  ON "ConversationClientLink" ("chatwootConversationId")
  WHERE "active";

-- History reads: newest row per conversation.
CREATE INDEX IF NOT EXISTS idx_conversation_client_link_conv_created
  ON "ConversationClientLink" ("chatwootConversationId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_client_link_application
  ON "ConversationClientLink" ("visaApplicationId")
  WHERE "visaApplicationId" IS NOT NULL;

-- RLS: SERVICE ROLE ONLY (same posture as webhook_events). This table is
-- an identity authority — if anon/authenticated could write it, a browser
-- could point a conversation at someone else's application and the Client
-- Action Centre would act on the wrong client. Lock it down explicitly.
ALTER TABLE "ConversationClientLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ConversationClientLink" FROM anon, authenticated;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ConversationClientLink'
      AND policyname = 'service_all_conversation_client_link'
  ) THEN
    CREATE POLICY service_all_conversation_client_link ON "ConversationClientLink"
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Validation ───────────────────────────────────────────────
-- The literal 'inbox_ux41a' column makes a zero-count result visibly a
-- RESULT (migration ran, objects missing) rather than a silent failure.
SELECT
  'inbox_ux41a' AS migration,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'ConversationClientLink')                              AS link_table,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'uq_conversation_client_link_active')                   AS uq_active,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_conversation_client_link_conv_created')            AS idx_history,
  (SELECT COUNT(*) FROM pg_policies
     WHERE tablename = 'ConversationClientLink'
       AND policyname = 'service_all_conversation_client_link')                AS rls_policy,
  (SELECT COUNT(*) FROM pg_class c
     WHERE c.relname = 'ConversationClientLink' AND c.relrowsecurity)          AS rls_enabled,
  (SELECT COUNT(*) FROM "ConversationClientLink")                              AS existing_rows;
-- Expect: inbox_ux41a | 1 | 1 | 1 | 1 | 1 | 0 (existing_rows grows over time)
