-- ============================================================
-- WALZ WHATSAPP BROADCAST V1.2 — UNIFIED CONTACTS + CONSENT + OPT-OUT
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- prisma db push / prisma migrate — after running, only `npx prisma
-- generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is
-- returned for review only. It has NOT been executed by the
-- implementing agent.
--
-- PREREQUISITE: whatsapp_broadcast_v1.sql and
-- whatsapp_broadcast_v1_1_audience.sql must already have been run.
--
-- SCOPE
--   creates 2 new tables : whatsapp_contact_exports,
--           whatsapp_consent_verifications
--   adds    4 columns to whatsapp_consents (capture_page,
--           disclosure_version, ip_address, user_agent)
--   adds    2 CHECK constraints (on whatsapp_consent_verifications),
--           0 foreign keys
--   alters  0 existing columns, drops 0 columns/tables/indexes
--   touches 0 rows anywhere — no backfill, no historical consent, no
--           historical export log or verification entries.
--
-- WHY THESE CHANGES TRAVEL TOGETHER
--   V1.2 is the first release that ever WRITES whatsapp_consents (via the
--   new public /whatsapp/preferences page and the new inbound STOP/
--   UNSUBSCRIBE webhook handling — both application-layer changes, no
--   schema needed for the writes themselves, since the table already had
--   normalizedNumber/status/source/consentedAt/optedOutAt). The four new
--   columns are audit-evidence metadata for THOSE writes, mirroring the
--   unrelated Consent Foundation V1 release's ConsentRecord shape for the
--   same reason: an auditable "show me the consent for this number" answer.
--   The export-log table is the audit trail for the new bulk CSV export
--   feature. whatsapp_consent_verifications is a P1 FIX added after
--   independent security review found the original /whatsapp/preferences
--   SUBSCRIBE flow had no proof-of-possession — it now requires a WhatsApp-
--   delivered OTP, and this table holds that short-lived challenge state.
--   All are small, additive, and independent of each other and of every
--   other WhatsApp table.
--
-- BACKFILL: NONE. The four new whatsapp_consents columns are NULL on every
--   pre-existing row (there were none written by any production workflow
--   before this release, per whatsapp_broadcast_v1.sql's own note). Both
--   new tables start empty and grow only from real use.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. whatsapp_consents — AUDIT METADATA for the new capture surfaces
-- ────────────────────────────────────────────────────────────
ALTER TABLE whatsapp_consents
  ADD COLUMN IF NOT EXISTS capture_page       text,
  ADD COLUMN IF NOT EXISTS disclosure_version text,
  ADD COLUMN IF NOT EXISTS ip_address         text,
  ADD COLUMN IF NOT EXISTS user_agent         text;

-- ────────────────────────────────────────────────────────────
-- 2. whatsapp_contact_exports — AUDIT TRAIL for bulk CSV export
--
--    Records who exported, when, how many rows, and a JSON SUMMARY of
--    what was exported (source types / filter shape). NEVER the exported
--    rows themselves — no name, no phone number, no consent status is
--    stored here. Exporting never creates or modifies any consent record;
--    this table is purely an audit trail for the export ACTION.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_contact_exports (
  id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  staff_id        text        NOT NULL,
  staff_email     text        NOT NULL,
  exported_at     timestamptz NOT NULL DEFAULT now(),
  recipient_count integer     NOT NULL,
  summary         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_address      text
);

CREATE INDEX IF NOT EXISTS idx_wa_contact_exports_staff_id
  ON whatsapp_contact_exports (staff_id);
CREATE INDEX IF NOT EXISTS idx_wa_contact_exports_exported_at
  ON whatsapp_contact_exports (exported_at);

-- RLS — service-role only, matching every other table in this feature.
-- This app has no Supabase-Auth-issued per-staff JWT, so RLS here can never
-- be scoped to "the requesting staff member's own export log rows" — the
-- REVOKE is what stops a holder of the public anon key from reading or
-- writing this table; the actual admin RBAC gate lives in the application
-- layer (marketing_whatsapp_export permission).
ALTER TABLE whatsapp_contact_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE whatsapp_contact_exports FROM anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_contact_exports' AND policyname = 'service_all_whatsapp_contact_exports'
  ) THEN
    CREATE POLICY service_all_whatsapp_contact_exports ON whatsapp_contact_exports
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. whatsapp_consent_verifications — P1 FIX: OTP proof-of-possession
--
--    ONE ROW PER SEND. Resending creates a new row rather than overwriting;
--    verify-code accepts only the MOST RECENT row for a given number.
--    Never stores the plaintext code — only a hash. Never itself IS
--    consent — only a successful, application-layer verification (see
--    lib/whatsapp/consent-otp.ts) writes WhatsAppConsent.SUBSCRIBED.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_consent_verifications (
  id                 text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  normalized_number  text        NOT NULL,
  purpose            text        NOT NULL DEFAULT 'WHATSAPP_MARKETING_SUBSCRIBE',
  -- sha256(code + ':' + this row's own id). Never the plaintext code.
  code_hash          text        NOT NULL,
  expires_at         timestamptz NOT NULL,
  attempts           integer     NOT NULL DEFAULT 0,
  max_attempts       integer     NOT NULL DEFAULT 5,
  -- Single-use AND the concurrency guard: set once, atomically, only by
  -- the ONE request that wins the guarded "consume" update. A second
  -- concurrent correct submission finds this already non-null and fails.
  consumed_at        timestamptz,
  locked_at          timestamptz,
  capture_page       text,
  disclosure_version text,
  ip_address         text,
  user_agent         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wa_consent_verifications_purpose') THEN
    ALTER TABLE whatsapp_consent_verifications
      ADD CONSTRAINT chk_wa_consent_verifications_purpose
      CHECK (purpose IN ('WHATSAPP_MARKETING_SUBSCRIBE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wa_consent_verifications_e164') THEN
    ALTER TABLE whatsapp_consent_verifications
      ADD CONSTRAINT chk_wa_consent_verifications_e164
      CHECK (normalized_number ~ '^\+[1-9][0-9]{6,14}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wa_consent_verifications_number_purpose_created
  ON whatsapp_consent_verifications (normalized_number, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_consent_verifications_expires_at
  ON whatsapp_consent_verifications (expires_at);

ALTER TABLE whatsapp_consent_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE whatsapp_consent_verifications FROM anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_consent_verifications' AND policyname = 'service_all_whatsapp_consent_verifications'
  ) THEN
    CREATE POLICY service_all_whatsapp_consent_verifications ON whatsapp_consent_verifications
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 4. Validation
-- ────────────────────────────────────────────────────────────
SELECT
  'whatsapp_broadcast_v1_2_consent_export' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'whatsapp_consents'
       AND column_name IN ('capture_page','disclosure_version','ip_address','user_agent'))  AS consent_audit_columns_added_expect_4,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'whatsapp_contact_exports')                                          AS export_log_table_expect_1,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_wa_contact_exports_staff_id')                                     AS export_log_staff_index_expect_1,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_wa_contact_exports_exported_at')                                  AS export_log_date_index_expect_1,
  (SELECT COUNT(*) FROM pg_policies
     WHERE tablename = 'whatsapp_contact_exports'
       AND policyname = 'service_all_whatsapp_contact_exports')                               AS export_log_rls_policy_expect_1,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'whatsapp_consent_verifications')                                     AS otp_verification_table_expect_1,
  (SELECT COUNT(*) FROM pg_constraint
     WHERE conname = 'chk_wa_consent_verifications_purpose')                                  AS otp_purpose_check_expect_1,
  (SELECT COUNT(*) FROM pg_constraint
     WHERE conname = 'chk_wa_consent_verifications_e164')                                     AS otp_e164_check_expect_1,
  (SELECT COUNT(*) FROM pg_policies
     WHERE tablename = 'whatsapp_consent_verifications'
       AND policyname = 'service_all_whatsapp_consent_verifications')                         AS otp_rls_policy_expect_1,
  -- HONEST EXPECTATION: zero. Nothing is backfilled.
  (SELECT COUNT(*) FROM whatsapp_contact_exports)                                             AS export_log_rows_expect_0,
  (SELECT COUNT(*) FROM whatsapp_consent_verifications)                                       AS otp_verification_rows_expect_0,
  (SELECT COUNT(*) FROM whatsapp_consents WHERE capture_page IS NOT NULL
                                              OR disclosure_version IS NOT NULL)               AS consent_audit_rows_expect_0_unless_real_optins_happened,
  -- Proof this migration left the eligibility-critical columns alone.
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'whatsapp_consents')    AS whatsapp_consents_total_columns_expect_14,
  (SELECT COUNT(*) FROM whatsapp_consents)                                                    AS whatsapp_consents_rows_unchanged;
-- Expect: whatsapp_broadcast_v1_2_consent_export | 4 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 14 | (same as before this migration)
