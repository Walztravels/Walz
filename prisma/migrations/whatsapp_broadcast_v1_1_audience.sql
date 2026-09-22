-- ============================================================
-- WALZ WHATSAPP BROADCAST V1.1 — UNIFIED RECIPIENT / AUDIENCE BUILDER
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- prisma db push / prisma migrate — after running, only `npx prisma
-- generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is
-- returned for review only, per the standing implementation instruction.
-- It has NOT been executed by the implementing agent.
--
-- PREREQUISITE: prisma/migrations/whatsapp_broadcast_v1.sql must already
-- have been run (it creates whatsapp_broadcast_recipients and
-- whatsapp_consents). This file only ADDS TO what that one created.
--
-- SCOPE
--   creates 0 new tables
--   adds    6 columns : 4 to whatsapp_broadcast_recipients (source_type,
--                       visa_application_id, source_provenance,
--                       display_name), 2 to "WhatsAppBroadcast"
--                       ("audienceSelection", "templateCategory")
--   adds    2 CHECK constraints, 1 foreign key, 2 indexes
--   alters  0 existing columns, drops 0 columns, 0 tables, 0 indexes
--   changes 0 RLS policies (the two tables' service-role-only posture from
--           whatsapp_broadcast_v1.sql is untouched and still correct —
--           every column added here is at least as sensitive as the ones
--           already protected)
--   touches 0 rows in "Lead", 0 rows in "VisaApplication", 0 rows in the
--           Supabase 'leads' table, 0 rows in 'messages', and nothing
--           belonging to Team Hub, the Inbox, SLA escalation, Twilio
--           calling or the Jade brief.
--
-- BACKFILL: NONE NEEDED. Every V1 recipient row came from the Lead
--   resolver, so source_type DEFAULT 'LEAD' is already the truth for them,
--   and source_provenance DEFAULT '[]' honestly says "no multi-source
--   provenance was recorded for this pre-V1.1 row" rather than inventing
--   one. No UPDATE statement appears anywhere in this file.
--
-- CONVENTIONS mirror whatsapp_broadcast_v1.sql exactly: lowercase
--   snake_case identifiers matching the Prisma @map names on the NEW
--   tables; camelCase quoted identifiers on the pre-existing
--   "WhatsAppBroadcast" table, which has no @@map; TEXT + CHECK instead of
--   a native Postgres ENUM (widening a CHECK is a trivial idempotent
--   ALTER, ALTER TYPE … ADD VALUE is not).
--
-- ── WHY "templateCategory" IS A COLUMN AND NOT A FEATURE ───────────────
--   It records which Meta template category ('MARKETING' | 'UTILITY' |
--   'AUTHENTICATION') an operator says they used, for their own
--   bookkeeping and for a future Meta-compliance report built on real
--   data. It is deliberately NOT read by any eligibility code path.
--   Nothing in this system can verify a self-declared category — Meta owns
--   template approval — so a relaxed consent path keyed on this column
--   would be a consent bypass wearing a compliance costume. Every
--   broadcast built through the audience builder takes the FULL
--   affirmative-consent check regardless of what this column says.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. whatsapp_broadcast_recipients — RECIPIENT PROVENANCE
--
--    The dedup guarantee is unchanged and is the reason these columns
--    exist in this shape: UNIQUE(broadcast_id, normalized_number) still
--    means ONE PHONE NUMBER = ONE RECIPIENT ROW = ONE MESSAGE. A human who
--    is simultaneously a Lead, a visa applicant and a pasted number is
--    collapsed into a single row BEFORE insert; these columns are how that
--    collapse stays auditable instead of silently losing two of the three
--    origins.
-- ────────────────────────────────────────────────────────────

ALTER TABLE whatsapp_broadcast_recipients
  -- The winning/primary source for this identity. DEFAULT 'LEAD' is
  -- correct for every row written by V1 (the only source that existed),
  -- which is why no backfill is required.
  ADD COLUMN IF NOT EXISTS source_type        text  NOT NULL DEFAULT 'LEAD',
  -- Attribution only, exactly like lead_id. The FK is added separately
  -- below so this statement stays re-runnable.
  ADD COLUMN IF NOT EXISTS visa_application_id text,
  -- [{ "type": "...", "id": "..."|null, "label": "..."|null }, …] — EVERY
  -- contributing source for this one dispatch identity.
  ADD COLUMN IF NOT EXISTS source_provenance  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The staff-typed name on a MANUAL entry. NULL for record-backed
  -- sources, whose name lives on the record itself.
  ADD COLUMN IF NOT EXISTS display_name       text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wa_broadcast_recipients_source_type') THEN
    ALTER TABLE whatsapp_broadcast_recipients
      ADD CONSTRAINT chk_wa_broadcast_recipients_source_type
      CHECK (source_type IN ('CLIENT','LEAD','VISA_APPLICATION','MANUAL'));
  END IF;
END $$;

-- ON DELETE SET NULL, matching lead_id: deleting a visa application must
-- never destroy the audit trail of a message that was already dispatched.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_wa_broadcast_recipients_visa_application') THEN
    ALTER TABLE whatsapp_broadcast_recipients
      ADD CONSTRAINT fk_wa_broadcast_recipients_visa_application
      FOREIGN KEY (visa_application_id) REFERENCES "VisaApplication"(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wa_broadcast_recipients_visa_application_id
  ON whatsapp_broadcast_recipients (visa_application_id);

-- The detail view's "how many of this campaign came from each source".
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_recipients_broadcast_source
  ON whatsapp_broadcast_recipients (broadcast_id, source_type);

-- ────────────────────────────────────────────────────────────
-- 2. "WhatsAppBroadcast" — the durable audience SELECTION
--
--    POINTERS ONLY. This column holds Lead ids, VisaApplication ids, the
--    explicitly-resolved filters and the raw manual number strings an
--    operator typed. It deliberately holds NO phone number belonging to a
--    database record, NO name, NO consent verdict and NO recipient count:
--    every one of those is re-derived from the live tables on each preview
--    and again, authoritatively, at snapshot time. That is V1's "a
--    browser-supplied recipientCount is never trusted" rule, restated for
--    three sources.
--
--    '{}' on a V1-shaped, filter-only broadcast — which keeps resolving
--    through V1's untouched single-source resolver.
-- ────────────────────────────────────────────────────────────

ALTER TABLE "WhatsAppBroadcast"
  ADD COLUMN IF NOT EXISTS "audienceSelection" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- BOOKKEEPING ONLY. See the header. Not read by any eligibility code.
  ADD COLUMN IF NOT EXISTS "templateCategory"  text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wa_broadcast_template_category') THEN
    ALTER TABLE "WhatsAppBroadcast"
      ADD CONSTRAINT chk_wa_broadcast_template_category
      CHECK ("templateCategory" IS NULL
             OR "templateCategory" IN ('MARKETING','UTILITY','AUTHENTICATION'));
  END IF;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 3. Validation
-- ────────────────────────────────────────────────────────────
SELECT
  'whatsapp_broadcast_v1_1_audience' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'whatsapp_broadcast_recipients'
       AND column_name IN ('source_type','visa_application_id',
                           'source_provenance','display_name'))              AS recipient_columns_added_expect_4,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'WhatsAppBroadcast'
       AND column_name IN ('audienceSelection','templateCategory'))          AS broadcast_columns_added_expect_2,
  (SELECT COUNT(*) FROM pg_constraint
     WHERE conname = 'chk_wa_broadcast_recipients_source_type')              AS source_type_check_expect_1,
  (SELECT COUNT(*) FROM pg_constraint
     WHERE conname = 'chk_wa_broadcast_template_category')                   AS template_category_check_expect_1,
  (SELECT COUNT(*) FROM pg_constraint
     WHERE conname = 'fk_wa_broadcast_recipients_visa_application')          AS visa_fk_expect_1,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_wa_broadcast_recipients_visa_application_id')    AS visa_index_expect_1,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_wa_broadcast_recipients_broadcast_source')       AS source_index_expect_1,
  -- THE DISPATCH-IDENTITY GUARANTEE IS UNCHANGED. Still exactly one
  -- recipient row per (broadcast, phone number), whichever combination of
  -- sources contributed that number.
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'uq_wa_broadcast_recipients_broadcast_number')        AS dispatch_identity_key_still_1,
  -- No V1 row was rewritten: every pre-existing recipient is LEAD, by
  -- column default, which is what it actually was.
  (SELECT COUNT(*) FROM whatsapp_broadcast_recipients
     WHERE source_type NOT IN ('CLIENT','LEAD','VISA_APPLICATION','MANUAL')) AS invalid_source_types_expect_0,
  -- HONEST EXPECTATION: still zero. This release adds no consent-capture
  -- surface, so every audience — from all three sources — continues to
  -- resolve to zero eligible recipients until one exists. A non-zero
  -- number here means somebody backfilled consent, which must be justified
  -- by real, auditable evidence per row.
  (SELECT COUNT(*) FROM whatsapp_consents WHERE status = 'SUBSCRIBED')       AS subscribed_consents_expect_0,
  -- Proof this migration added no column to either protected source table.
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'Lead')            AS lead_columns_unchanged,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'VisaApplication') AS visa_columns_unchanged;
-- Expect: whatsapp_broadcast_v1_1_audience | 4 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | (pre-existing counts, unchanged)
