-- ============================================================
-- WALZ WHATSAPP BROADCAST V1.2.1 — TWILIO PROVIDER ALIGNMENT
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- prisma db push / prisma migrate — after running, only `npx prisma
-- generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is
-- returned for review only. It has NOT been executed by the
-- implementing agent.
--
-- PREREQUISITE: whatsapp_broadcast_v1.sql, whatsapp_broadcast_v1_1_audience.sql
-- and whatsapp_broadcast_v1_2_consent_export.sql must already have been run.
--
-- WHY THIS RELEASE EXISTS
--   A provider audit found WhatsApp Broadcast V1/V1.1 and the V1.2 OTP
--   fix had been built sending directly through Meta Cloud API
--   (graph.facebook.com), while the rest of Walz's WhatsApp infrastructure
--   — the staff Inbox channel, visa application threads, the chat drawer,
--   quotes, eSIM and recovery messages — already runs through Twilio (see
--   lib/twilio-whatsapp.ts). This migration adds the provider-neutral
--   columns the Twilio transport layer needs; it does NOT touch consent,
--   audience, dedup, opt-out or OTP-security schema at all.
--
-- SCOPE
--   adds 2 columns to "WhatsAppBroadcast"            (content_sid, content_variables)
--   adds 2 columns to whatsapp_broadcast_recipients   (provider_message_id + its unique index)
--   adds 0 CHECK constraints, 0 foreign keys
--   alters 0 existing columns, drops 0 columns/tables/indexes/constraints
--   touches 0 rows anywhere — no backfill.
--
-- WHAT IS DELIBERATELY LEFT ALONE (legacy Meta columns, for read
-- compatibility with any historical V1/V1.1 row — see prisma/schema.prisma's
-- own comments on templateName/templateLanguage/templateParams and
-- metaMessageId):
--   "WhatsAppBroadcast"."templateName", "templateLanguage", "templateParams"
--   whatsapp_broadcast_recipients.meta_message_id (+ its existing unique index)
-- No new code path writes any of these four; they are neither dropped nor
-- renamed, because doing so would not be additive.
--
-- NOT TOUCHED AT ALL BY THIS MIGRATION (confirm before/after — see the
-- companion validation script):
--   whatsapp_consents, consent_records, whatsapp_consent_verifications,
--   whatsapp_contact_exports, "Lead", "VisaApplication", SLA tables,
--   Team Hub tables, Inbox tables.
--
-- BACKFILL: NONE. The two new WhatsAppBroadcast columns are NULL/'{}' on
--   every existing row; the new recipient column is NULL on every existing
--   row (there are zero rows in whatsapp_broadcast_recipients in
--   production as of the V1.2 gate, so this is moot in practice, but the
--   migration is written correctly regardless).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. "WhatsAppBroadcast" — Twilio approved Content Template reference
-- ────────────────────────────────────────────────────────────
ALTER TABLE "WhatsAppBroadcast"
  ADD COLUMN IF NOT EXISTS "contentSid"       text,
  ADD COLUMN IF NOT EXISTS "contentVariables" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ────────────────────────────────────────────────────────────
-- 2. whatsapp_broadcast_recipients — provider-neutral dispatch id
--
--    Named provider-neutrally (not "twilio_message_id") because a
--    dispatch-identity/idempotency field should not need renaming again
--    if the provider ever changes once more.
-- ────────────────────────────────────────────────────────────
ALTER TABLE whatsapp_broadcast_recipients
  ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_broadcast_recipients_provider_message_id
  ON whatsapp_broadcast_recipients (provider_message_id);

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 3. Validation
-- ────────────────────────────────────────────────────────────
SELECT
  'whatsapp_broadcast_v1_2_1_twilio_transport' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'WhatsAppBroadcast' AND column_name = 'contentSid')            AS broadcast_content_sid_expect_1,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'WhatsAppBroadcast' AND column_name = 'contentVariables')       AS broadcast_content_variables_expect_1,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'whatsapp_broadcast_recipients' AND column_name = 'provider_message_id') AS recipient_provider_message_id_expect_1,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'uq_wa_broadcast_recipients_provider_message_id')                AS recipient_provider_message_id_index_expect_1,
  -- Proof the legacy Meta columns are still there, untouched.
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'WhatsAppBroadcast' AND column_name IN ('templateName','templateLanguage','templateParams')) AS legacy_meta_broadcast_columns_expect_3,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'whatsapp_broadcast_recipients' AND column_name = 'meta_message_id')  AS legacy_meta_message_id_column_expect_1,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'whatsapp_broadcast_recipients_meta_message_id_key'
        OR indexname LIKE '%meta_message_id%')                                          AS legacy_meta_message_id_index_expect_gte_1,
  -- HONEST EXPECTATION: zero. Nothing is backfilled.
  (SELECT COUNT(*) FROM whatsapp_broadcast_recipients WHERE provider_message_id IS NOT NULL) AS provider_message_id_rows_expect_0,
  (SELECT COUNT(*) FROM "WhatsAppBroadcast" WHERE "contentSid" IS NOT NULL)              AS content_sid_rows_expect_0,
  -- Proof this migration left every other WhatsApp table alone.
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'whatsapp_consents')             AS whatsapp_consents_columns_unchanged_expect_14,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'consent_records')               AS consent_records_columns_unchanged_expect_14,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'whatsapp_consent_verifications') AS otp_columns_unchanged_expect_14,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'whatsapp_contact_exports')       AS export_log_columns_unchanged_expect_7,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'Lead')                          AS lead_columns_unchanged,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'VisaApplication')               AS visa_application_columns_unchanged,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'StaffNotification_staffId_sourceId_key')        AS sla_constraint_expect_0,
  (SELECT COUNT(*) FROM whatsapp_broadcast_recipients)                                                 AS wa_recipients_rows_unchanged,
  (SELECT COUNT(*) FROM whatsapp_consents)                                                             AS whatsapp_consents_rows_unchanged,
  (SELECT COUNT(*) FROM whatsapp_consent_verifications)                                                AS otp_rows_unchanged;
-- Expect: whatsapp_broadcast_v1_2_1_twilio_transport | 1 | 1 | 1 | 1 | 3 | 1 | >=1 | 0 | 0 | 14 | 14 | 14 | 7 | (unchanged) | (unchanged) | 0 | (unchanged) | (unchanged) | (unchanged)
