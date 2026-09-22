-- ============================================================
-- WALZ CONSENT FOUNDATION V1 (idempotent, hand-run in the Supabase SQL
-- Editor). NEVER via prisma db push / prisma migrate — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is
-- returned for review only, per the standing implementation instruction.
-- It has NOT been executed by the implementing agent.
--
-- WHY THIS EXISTS
--   Twilio rejected the Walz A2P 10DLC CUSTOMER_CARE campaign with error
--   30896 (the public opt-in page displayed inadequate SMS consent
--   language). Fixing the page is only half the fix: the affirmative
--   ticks it now collects have to land somewhere auditable, because the
--   carrier's question is always "show me the consent for THIS number".
--
-- SCOPE
--   creates 1 new table  : consent_records
--   adds    0 columns to any existing table
--   alters  0 columns, drops 0 columns, 0 tables, 0 indexes, 0 constraints
--   touches 0 rows in "Lead", 0 rows in whatsapp_consents, 0 rows in
--           "VisaApplication", 0 rows in any Client/account table, and
--           nothing belonging to Team Hub, the Inbox, SLA escalation,
--           Twilio Team Hub calling or the WhatsApp Broadcast feature.
--
-- ── THE TABLE IS CREATED EMPTY, AND THAT IS CORRECT ─────────────────────
--   There is NO backfill in this file and no backfill script anywhere in
--   the release. Existing phone numbers on leads, visa applications,
--   clients and historical bookings are NOT converted into consent rows of
--   any status. A number that never went through a consent checkbox has no
--   row, which is the honest "never asked" state — exactly the posture
--   whatsapp_consents already takes. A non-zero row count immediately
--   after running this migration means somebody backfilled consent, which
--   would have to be justified by real, auditable, per-row evidence.
--
-- ── RELATIONSHIP TO whatsapp_consents ───────────────────────────────────
--   This migration does not read, write, alter, drop or re-point
--   whatsapp_consents. That table remains the SOLE source of truth for
--   WhatsApp marketing broadcast eligibility (lib/whatsapp/broadcast/
--   consent.ts). The 'WHATSAPP_MARKETING' value in the purpose CHECK below
--   is taxonomy/reporting vocabulary ONLY — nothing in the broadcast
--   eligibility path reads consent_records, by design.
--
-- CONVENTIONS mirror prisma/migrations/whatsapp_broadcast_v1.sql and
-- team_hub_v1_core.sql: lowercase snake_case identifiers matching the
-- Prisma @map names, TEXT + CHECK instead of a native Postgres ENUM
-- (widening a CHECK is a trivial idempotent ALTER; ALTER TYPE ... ADD
-- VALUE is not), RLS enabled with a service-role-only policy and
-- REVOKE ALL FROM anon, authenticated.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. NEW TABLE: consent_records
--    Affirmative, auditable, multi-purpose consent.
--
--    Keyed on (normalized_number, purpose) because consent attaches to the
--    endpoint that receives the message, and each purpose is INDEPENDENT:
--    a number may be GRANTED for SMS_CUSTOMER_CARE and have no row at all
--    for SMS_MARKETING. Granting one purpose never implies another.
--
--    Deliberately NOT keyed on, nor foreign-keyed to, "Lead": a lead-keyed
--    design invites "this lead has a phone number, therefore…". It does
--    not. There is no join path from a lead to a consent row here.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consent_records (
  id                 text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- E.164 ('+2348…'), produced server-side by normalizePhoneE164() in
  -- lib/identity/normalize.ts. Never taken raw from the client.
  normalized_number  text        NOT NULL,
  purpose            text        NOT NULL,
  status             text        NOT NULL,
  -- Free-form provenance ('booking_checkout_sms_customer_care', …).
  -- Deliberately not an enum, matching whatsapp_consents.source.
  source             text,

  -- ── Audit context: enough to defend a record to a carrier ───────────
  -- The page the box was ticked on ('/book').
  capture_page       text,
  -- Which disclosure wording was agreed to ('sms-customer-care-v1'), so a
  -- later audit can reproduce the exact sentence the person consented to.
  disclosure_version text,
  -- Mirrors the consent-adjacent capture already used by
  -- app/api/credit-card-authorization/[token]/route.ts (ip + user agent).
  ip_address         text,
  user_agent         text,
  -- Short human-readable proof pointer (booking reference, form id).
  evidence           text,

  consented_at       timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  -- The three purposes, exactly. TEXT + CHECK, never CREATE TYPE.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_consent_records_purpose') THEN
    ALTER TABLE consent_records
      ADD CONSTRAINT chk_consent_records_purpose
      CHECK (purpose IN ('SMS_CUSTOMER_CARE','SMS_MARKETING','WHATSAPP_MARKETING'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_consent_records_status') THEN
    ALTER TABLE consent_records
      ADD CONSTRAINT chk_consent_records_status
      CHECK (status IN ('GRANTED','NOT_GRANTED','REVOKED'));
  END IF;

  -- A GRANTED row without a timestamp is not auditable consent. This is
  -- the database-level version of the rule the API route enforces: you
  -- cannot assert consent without saying WHEN it was given.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_consent_records_granted_dated') THEN
    ALTER TABLE consent_records
      ADD CONSTRAINT chk_consent_records_granted_dated
      CHECK (status <> 'GRANTED' OR consented_at IS NOT NULL);
  END IF;

  -- Likewise a REVOKED row must say when it was revoked.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_consent_records_revoked_dated') THEN
    ALTER TABLE consent_records
      ADD CONSTRAINT chk_consent_records_revoked_dated
      CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL);
  END IF;

  -- Consent is only ever recorded against an E.164 number. A national
  -- ('0803…') or empty value means the normalizer was bypassed.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_consent_records_e164') THEN
    ALTER TABLE consent_records
      ADD CONSTRAINT chk_consent_records_e164
      CHECK (normalized_number ~ '^\+[1-9][0-9]{6,14}$');
  END IF;
END $$;

-- ── THE PURPOSE-INDEPENDENCE KEY ────────────────────────────────────────
-- One row per (number, purpose) pair. This is what makes the three
-- purposes genuinely independent at the database level: a row for
-- SMS_CUSTOMER_CARE occupies a different slot from SMS_MARKETING for the
-- same number, so granting one can never overwrite, imply or satisfy
-- another. It also makes a repeat affirmative action an UPSERT rather than
-- a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_records_number_purpose
  ON consent_records (normalized_number, purpose);

-- Reporting predicate: "how many numbers are GRANTED for purpose X".
CREATE INDEX IF NOT EXISTS idx_consent_records_purpose_status
  ON consent_records (purpose, status);

-- ────────────────────────────────────────────────────────────
-- 2. updated_at maintenance
--    Prisma stamps @updatedAt from the client on every write it performs,
--    so this trigger exists only so a hand-run SQL UPDATE (e.g. an
--    operator recording a REVOKED consent in the SQL editor) keeps
--    updated_at honest.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION consent_records_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_consent_records_touch') THEN
    CREATE TRIGGER trg_consent_records_touch
      BEFORE UPDATE ON consent_records
      FOR EACH ROW EXECUTE FUNCTION consent_records_touch_updated_at();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. RLS — service-role only
--
-- Identical posture to whatsapp_consents in whatsapp_broadcast_v1.sql,
-- because this table is exactly as sensitive: real customer phone numbers
-- plus their consent state. This app has NO Supabase-Auth-issued per-staff
-- JWT, so RLS here can never be scoped to "the requesting staff member's
-- own rows". The REVOKE is therefore load-bearing and PERMANENT — it is
-- what stops a holder of the public anon key (readable in any deployed JS
-- bundle) from reading or, worse, INSERTING consent records. Do NOT grant
-- anon/authenticated anything to make a future client feature work; go
-- through the server route instead.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'consent_records'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'service_all_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'service_all_' || t, t
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 4. Validation
-- ────────────────────────────────────────────────────────────
SELECT
  'consent_foundation_v1' AS migration,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'consent_records')                                  AS consent_records_table,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'uq_consent_records_number_purpose')                  AS purpose_independence_key,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_consent_records_purpose_status')                 AS reporting_index,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_consent_records_purpose')         AS purpose_check,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_consent_records_status')          AS status_check,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_consent_records_granted_dated')   AS granted_dated_check,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_consent_records_revoked_dated')   AS revoked_dated_check,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_consent_records_e164')            AS e164_check,
  (SELECT COUNT(*) FROM pg_policies
     WHERE tablename = 'consent_records'
       AND policyname = 'service_all_consent_records')                       AS rls_policy,
  -- HONEST EXPECTATION: zero. Nothing is backfilled. Consent rows appear
  -- only as real customers tick the box on the live opt-in page. A
  -- non-zero number here means somebody backfilled consent.
  (SELECT COUNT(*) FROM consent_records)                                     AS consent_rows_expect_0,
  -- Proof this migration left the protected WhatsApp consent store alone.
  (SELECT COUNT(*) FROM whatsapp_consents)                                   AS whatsapp_consents_unchanged,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'whatsapp_consents')                                 AS whatsapp_consents_columns_unchanged,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'Lead') AS lead_columns_unchanged;
-- Expect: consent_foundation_v1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | (pre-existing count, unchanged) | 10 | (pre-existing count, unchanged)
--   whatsapp_consents has 10 columns (id, lead_id, normalized_number,
--   status, source, evidence, consented_at, opted_out_at, created_at,
--   updated_at) and this migration adds none.
