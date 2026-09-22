-- ============================================================
-- WALZ WHATSAPP BROADCAST V1 (idempotent, hand-run in the Supabase SQL
-- Editor). NEVER via prisma db push / prisma migrate — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is
-- returned for review only, per the standing implementation instruction.
-- It has NOT been executed by the implementing agent.
--
-- SCOPE
--   creates 2 new tables  : whatsapp_broadcast_recipients, whatsapp_consents
--   adds   16 columns     : all to the EXISTING "WhatsAppBroadcast" table
--   alters  1 column      : "WhatsAppBroadcast".status — DEFAULT changed and
--                           existing values re-cased (see the note below)
--   drops   0 columns, 0 tables, 0 indexes, 0 constraints
--   touches 0 rows in "Lead", 0 rows in the Supabase 'leads' table,
--           0 rows in 'messages', and nothing belonging to Team Hub,
--           the Inbox, SLA escalation or the Jade brief.
--
-- WHY status VALUES ARE RE-CASED, AND WHY THAT IS SAFE
--   "WhatsAppBroadcast".status was a free-text column defaulting to
--   'draft'. Exactly TWO places in the entire repository ever read it:
--     app/api/admin/marketing/whatsapp-broadcast/route.ts  (passes it through)
--     app/admin/marketing/whatsapp/page.tsx                (STATUS_COLORS map)
--   Both are rewritten by this release to the uppercase vocabulary, and no
--   cron, report, Jade path, webhook or Supabase view reads the column.
--   The UPDATE below is therefore a complete migration, not a partial one.
--
-- CONVENTIONS mirror prisma/migrations/team_hub_v1_core.sql and
-- team_email_notifications_v1_1.sql: lowercase snake_case identifiers
-- matching the Prisma @map names on NEW tables, TEXT + CHECK instead of a
-- native Postgres ENUM (widening a CHECK is a trivial idempotent ALTER;
-- ALTER TYPE ... ADD VALUE is not), RLS enabled with a service-role-only
-- policy and REVOKE ALL FROM anon, authenticated.
--
-- EXCEPTION, deliberate: columns ADDED to "WhatsAppBroadcast" keep that
-- pre-existing table's camelCase, quoted style, because the table has no
-- @@map and its existing columns are camelCase. Mixing snake_case into it
-- would not match Prisma's generated SQL.
--
-- NOT DONE HERE, deliberately: RLS is NOT enabled on the pre-existing
-- "WhatsAppBroadcast" table. This migration is additive; changing an
-- existing table's security posture is a separate, reviewable decision.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. EXISTING TABLE: "WhatsAppBroadcast" — additive columns
-- ────────────────────────────────────────────────────────────

ALTER TABLE "WhatsAppBroadcast"
  -- Derived delivery counters. Recomputed from the recipient rows by
  -- recomputeBroadcastCounts(); never incremented, so they cannot drift
  -- when Meta redelivers a status callback.
  ADD COLUMN IF NOT EXISTS "deliveredCount"   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "readCount"        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failedCount"      integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "skippedCount"     integer     NOT NULL DEFAULT 0,
  -- The Meta approved-template definition. A broadcast is ALWAYS sent as
  -- type:'template'; there is no free-form fallback in the send path.
  ADD COLUMN IF NOT EXISTS "templateName"     text,
  ADD COLUMN IF NOT EXISTS "templateLanguage" text,
  -- Ordered body-parameter MAPPING (not values).
  ADD COLUMN IF NOT EXISTS "templateParams"   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- The computed audience breakdown frozen at approval time. The
  -- authoritative snapshot is the recipient rows themselves; this keeps
  -- the counts that cannot be reconstructed from rows (duplicates
  -- collapsed, leads filtered out by country prefix).
  ADD COLUMN IF NOT EXISTS "audienceSnapshot" jsonb,
  ADD COLUMN IF NOT EXISTS "snapshotAt"       timestamptz,
  ADD COLUMN IF NOT EXISTS "approvedBy"       text,
  -- Lifecycle timestamps.
  ADD COLUMN IF NOT EXISTS "queuedAt"         timestamptz,
  ADD COLUMN IF NOT EXISTS "startedAt"        timestamptz,
  ADD COLUMN IF NOT EXISTS "completedAt"      timestamptz,
  ADD COLUMN IF NOT EXISTS "cancelledAt"      timestamptz,
  ADD COLUMN IF NOT EXISTS "cancelledBy"      text,
  -- Prisma @updatedAt. DEFAULT now() so existing rows are valid.
  ADD COLUMN IF NOT EXISTS "updatedAt"        timestamptz NOT NULL DEFAULT now();

-- ── status: migrate the legacy lowercase vocabulary, then constrain ────
-- Re-runnable: rows already uppercase are matched by no branch and left
-- alone; an unrecognised legacy value is parked as DRAFT (safe — DRAFT
-- sends nothing) rather than failing the CHECK below.
UPDATE "WhatsAppBroadcast"
SET "status" = CASE lower("status")
                 WHEN 'draft'     THEN 'DRAFT'
                 WHEN 'ready'     THEN 'READY'
                 WHEN 'scheduled' THEN 'SCHEDULED'
                 WHEN 'queued'    THEN 'QUEUED'
                 WHEN 'sending'   THEN 'SENDING'
                 WHEN 'sent'      THEN 'COMPLETED'
                 WHEN 'failed'    THEN 'FAILED'
                 WHEN 'cancelled' THEN 'CANCELLED'
                 ELSE 'DRAFT'
               END
WHERE "status" IS NULL
   OR "status" <> upper("status")
   OR "status" NOT IN ('DRAFT','READY','SCHEDULED','QUEUED','SENDING',
                       'COMPLETED','PARTIAL_FAILURE','FAILED','CANCELLED');

ALTER TABLE "WhatsAppBroadcast" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wa_broadcast_status') THEN
    ALTER TABLE "WhatsAppBroadcast"
      ADD CONSTRAINT chk_wa_broadcast_status
      CHECK ("status" IN ('DRAFT','READY','SCHEDULED','QUEUED','SENDING',
                          'COMPLETED','PARTIAL_FAILURE','FAILED','CANCELLED'));
  END IF;
END $$;

-- The cron's promote-due-campaigns scan predicate.
CREATE INDEX IF NOT EXISTS "WhatsAppBroadcast_status_scheduledAt_idx"
  ON "WhatsAppBroadcast" ("status", "scheduledAt");

-- ────────────────────────────────────────────────────────────
-- 2. NEW TABLE: whatsapp_consents
--    Affirmative, auditable WhatsApp MARKETING consent.
--
--    Keyed on the phone NUMBER, not on a lead, because (a) consent
--    attaches to the endpoint that receives the message and (b) "Lead" is
--    unique only on (source, sourceId), so one human legitimately owns
--    several lead rows (see inbox_0s4a_lead_cleanup.sql for a real
--    production duplicate).
--
--    A number with NO ROW here is UNKNOWN, i.e. NOT eligible. Nothing in
--    the product writes this table yet, so it is expected to be EMPTY
--    after this migration and every audience will resolve to zero
--    eligible recipients until a consent-capture surface exists. That is
--    the intended, correct behaviour.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_consents (
  id                text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- Attribution only; SetNull so deleting a CRM lead never destroys the
  -- consent record that authorises messaging that number.
  lead_id           text        REFERENCES "Lead"(id) ON DELETE SET NULL,
  normalized_number text        NOT NULL UNIQUE,
  status            text        NOT NULL DEFAULT 'UNKNOWN',
  -- Free-form provenance ('web_form', 'sms_reply', 'unknown_legacy', …).
  -- Deliberately not an enum: the real capture sources do not exist yet.
  source            text,
  -- Short human-readable proof pointer (form id, message id, ticket URL).
  evidence          text,
  consented_at      timestamptz,
  opted_out_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_whatsapp_consents_status') THEN
    ALTER TABLE whatsapp_consents
      ADD CONSTRAINT chk_whatsapp_consents_status
      CHECK (status IN ('SUBSCRIBED','UNKNOWN','OPTED_OUT'));
  END IF;
  -- A SUBSCRIBED row without a timestamp is not auditable consent.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_whatsapp_consents_subscribed_dated') THEN
    ALTER TABLE whatsapp_consents
      ADD CONSTRAINT chk_whatsapp_consents_subscribed_dated
      CHECK (status <> 'SUBSCRIBED' OR consented_at IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_consents_status  ON whatsapp_consents (status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_consents_lead_id ON whatsapp_consents (lead_id);

-- ────────────────────────────────────────────────────────────
-- 3. NEW TABLE: whatsapp_broadcast_recipients
--    One durable row per resolved audience member for ONE broadcast.
--    Creating these rows IS the audience snapshot.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_broadcast_recipients (
  id                       text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  broadcast_id             text        NOT NULL REFERENCES "WhatsAppBroadcast"(id) ON DELETE CASCADE,
  -- Attribution only. SetNull so deleting a lead never destroys the send
  -- audit trail for a message that was already dispatched.
  lead_id                  text        REFERENCES "Lead"(id) ON DELETE SET NULL,
  -- E.164 ('+2348…'). NULL means the lead had no usable WhatsApp number
  -- (status SKIPPED_INVALID_NUMBER). Postgres treats NULLs as DISTINCT in
  -- a unique index, so many such rows coexist happily under the unique
  -- constraint below while real numbers stay deduplicated.
  normalized_number        text,
  -- Meta's wa_id form (no '+'), frozen so the send payload never
  -- re-derives it from lead data that may have changed since approval.
  wa_id                    text,
  -- The RESOLVED ordered body parameter VALUES for this recipient, frozen
  -- at approval time. Never re-resolved at send time.
  template_params_snapshot jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status                   text        NOT NULL DEFAULT 'QUEUED',
  -- Meta's wamid. Its PRESENCE is the hard "already dispatched" proof: the
  -- processor refuses to call Meta for any row that already has one,
  -- whatever triggered the retry.
  meta_message_id          text,
  failure_code             text,
  failure_reason           text,
  attempts                 integer     NOT NULL DEFAULT 0,
  next_attempt_at          timestamptz,
  queued_at                timestamptz,
  sent_at                  timestamptz,
  delivered_at             timestamptz,
  read_at                  timestamptz,
  failed_at                timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wa_broadcast_recipients_status') THEN
    ALTER TABLE whatsapp_broadcast_recipients
      ADD CONSTRAINT chk_wa_broadcast_recipients_status
      CHECK (status IN ('QUEUED','SENDING','SENT','DELIVERED','READ','FAILED',
                        'SKIPPED_OPT_OUT','SKIPPED_NO_CONSENT','SKIPPED_INVALID_NUMBER'));
  END IF;
END $$;

-- ── THE DISPATCH-IDENTITY GUARANTEE ─────────────────────────────────────
-- Database-level proof that one PHONE NUMBER cannot be dispatched twice
-- for the same broadcast. Keyed on the number rather than on lead_id
-- because WhatsApp delivers to a number and the same human may own
-- several "Lead" rows — a lead-keyed constraint would let that person
-- receive the campaign twice. NULL numbers (unsendable rows) are DISTINCT
-- under Postgres's default NULLS DISTINCT, so they are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_broadcast_recipients_broadcast_number
  ON whatsapp_broadcast_recipients (broadcast_id, normalized_number);

-- Webhook status callbacks look a recipient up by Meta's message id, and
-- a wamid is globally unique, so this both indexes and protects the lookup.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_broadcast_recipients_meta_message_id
  ON whatsapp_broadcast_recipients (meta_message_id);

-- The detail view's groupBy and the processor's per-broadcast scan.
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_recipients_broadcast_status
  ON whatsapp_broadcast_recipients (broadcast_id, status);

-- The processor's due-work predicate ("QUEUED and no backoff pending").
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_recipients_status_next_attempt
  ON whatsapp_broadcast_recipients (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_wa_broadcast_recipients_lead_id
  ON whatsapp_broadcast_recipients (lead_id);

-- ────────────────────────────────────────────────────────────
-- 4. updated_at maintenance
--    Prisma stamps @updatedAt from the client on every write it performs,
--    so these triggers exist only so a hand-run SQL UPDATE (e.g. an
--    operator parking a stuck recipient in the SQL editor) keeps
--    updated_at honest.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION whatsapp_broadcast_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- "WhatsAppBroadcast" uses the camelCase "updatedAt" column, so it needs
-- its own trigger function rather than the snake_case one above.
CREATE OR REPLACE FUNCTION whatsapp_broadcast_touch_updated_at_camel()
RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_wa_broadcast_recipients_touch') THEN
    CREATE TRIGGER trg_wa_broadcast_recipients_touch
      BEFORE UPDATE ON whatsapp_broadcast_recipients
      FOR EACH ROW EXECUTE FUNCTION whatsapp_broadcast_touch_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_whatsapp_consents_touch') THEN
    CREATE TRIGGER trg_whatsapp_consents_touch
      BEFORE UPDATE ON whatsapp_consents
      FOR EACH ROW EXECUTE FUNCTION whatsapp_broadcast_touch_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_wa_broadcast_touch') THEN
    CREATE TRIGGER trg_wa_broadcast_touch
      BEFORE UPDATE ON "WhatsAppBroadcast"
      FOR EACH ROW EXECUTE FUNCTION whatsapp_broadcast_touch_updated_at_camel();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. RLS — service-role only, on the TWO NEW TABLES
--
-- Identical posture to team_hub_v1_core.sql / team_email_notifications
-- _v1_1.sql: this app has NO Supabase-Auth-issued per-staff JWT, so RLS
-- here can never be scoped to "the requesting staff member's own rows".
-- The REVOKE is therefore load-bearing and PERMANENT — it is what stops a
-- holder of the public anon key (readable in any deployed JS bundle) from
-- reading the client phone numbers and consent records in these tables.
-- Do NOT grant anon/authenticated SELECT to make some future client
-- feature work; go through the session-gated REST routes instead.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'whatsapp_broadcast_recipients',
    'whatsapp_consents'
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
-- 6. Validation
-- ────────────────────────────────────────────────────────────
SELECT
  'whatsapp_broadcast_v1' AS migration,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'whatsapp_broadcast_recipients')                       AS recipients_table,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'whatsapp_consents')                                   AS consents_table,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'WhatsAppBroadcast'
       AND column_name IN ('deliveredCount','readCount','failedCount','skippedCount',
                           'templateName','templateLanguage','templateParams',
                           'audienceSnapshot','snapshotAt','approvedBy',
                           'queuedAt','startedAt','completedAt','cancelledAt',
                           'cancelledBy','updatedAt'))                         AS broadcast_columns_added_expect_16,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'uq_wa_broadcast_recipients_broadcast_number')          AS dispatch_identity_key,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'uq_wa_broadcast_recipients_meta_message_id')           AS meta_message_id_key,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_wa_broadcast_recipients_status_next_attempt')      AS cron_scan_index,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_wa_broadcast_status')              AS broadcast_status_check,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_wa_broadcast_recipients_status')   AS recipient_status_check,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_whatsapp_consents_status')         AS consent_status_check,
  (SELECT COUNT(*) FROM pg_policies
     WHERE tablename = 'whatsapp_broadcast_recipients'
       AND policyname = 'service_all_whatsapp_broadcast_recipients')           AS rls_policy_recipients,
  (SELECT COUNT(*) FROM pg_policies
     WHERE tablename = 'whatsapp_consents'
       AND policyname = 'service_all_whatsapp_consents')                       AS rls_policy_consents,
  -- No legacy lowercase status value survives.
  (SELECT COUNT(*) FROM "WhatsAppBroadcast"
     WHERE "status" NOT IN ('DRAFT','READY','SCHEDULED','QUEUED','SENDING',
                            'COMPLETED','PARTIAL_FAILURE','FAILED','CANCELLED')) AS unmigrated_statuses_expect_0,
  -- HONEST EXPECTATION: zero. Nothing writes consent yet, so every
  -- audience resolves to zero eligible recipients until a capture surface
  -- exists. A non-zero number here means somebody backfilled consent —
  -- which must be justified by real, auditable evidence per row.
  (SELECT COUNT(*) FROM whatsapp_consents WHERE status = 'SUBSCRIBED')         AS subscribed_consents_expect_0,
  -- Proof this migration did not touch the two protected lead stores.
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'Lead')  AS lead_columns_unchanged;
-- Expect: whatsapp_broadcast_v1 | 1 | 1 | 16 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | (pre-existing count, unchanged)
