-- ============================================================
-- WALZ TEAM HUB V1.1 — STAFF EMAIL NOTIFICATIONS (idempotent, hand-run in
-- the Supabase SQL Editor). NEVER via prisma db push / prisma migrate —
-- after running, only `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is
-- returned for review only, per the standing implementation instruction.
-- It has NOT been executed by the implementing agent.
--
-- Fully additive: creates 2 new tables, adds 0 columns to any existing
-- table, alters 0 existing tables, touches 0 existing indexes/constraints.
-- In particular it does NOT touch "StaffNotification" in any way (no
-- unique constraint, no column, no index) — this feature's dedup key lives
-- exclusively on its OWN table below.
--
-- Conventions match prisma/migrations/team_hub_v1_core.sql exactly:
-- lowercase snake_case identifiers matching the Prisma @map names, TEXT +
-- CHECK constraint instead of a Postgres ENUM (widening a CHECK is a
-- trivial idempotent ALTER; ALTER TYPE ... ADD VALUE is not), RLS enabled
-- with a service-role-only policy and REVOKE ALL FROM anon, authenticated.
-- ============================================================

-- ── team_email_notification_candidates ───────────────────────────────────
-- "A pending reason to maybe email this staff member." Written by
-- lib/team/email-notify.ts alongside (never inside) lib/team/notify.ts's
-- dashboard wrappers; drained by /api/cron/team-email-notifications.
CREATE TABLE IF NOT EXISTS team_email_notification_candidates (
  id                text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  staff_id          text        NOT NULL REFERENCES "Staff"(id) ON DELETE CASCADE,
  kind              text        NOT NULL,
  conversation_id   text        NOT NULL REFERENCES team_conversations(id) ON DELETE CASCADE,
  -- TeamMessage.id | TeamCallRecord.id | TeamConversation.id depending on
  -- `kind` — deliberately NOT a foreign key, mirroring the sourceId
  -- convention already used by lib/team/notify.ts (one polymorphic column,
  -- re-validated at send time against the real row).
  source_id         text        NOT NULL,
  -- Staff display name of the actor. NEVER message content: the email's
  -- one-line preview is re-read from team_messages at send time, after
  -- membership + read-state are re-verified.
  actor_name        text,
  status            text        NOT NULL DEFAULT 'PENDING',
  scheduled_send_at timestamptz NOT NULL,
  event_at          timestamptz NOT NULL DEFAULT now(),
  attempts          integer     NOT NULL DEFAULT 0,
  sent_at           timestamptz,
  resolved_at       timestamptz,
  -- Metadata only, never content (see the CHECK below for the vocabulary).
  cancel_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_team_email_candidates_kind'
  ) THEN
    ALTER TABLE team_email_notification_candidates
      ADD CONSTRAINT chk_team_email_candidates_kind
      CHECK (kind IN ('DM','MENTION','THREAD_REPLY','MISSED_CALL','INVITE'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_team_email_candidates_status'
  ) THEN
    ALTER TABLE team_email_notification_candidates
      ADD CONSTRAINT chk_team_email_candidates_status
      CHECK (status IN ('PENDING','SENDING','SENT','CANCELLED','FAILED'));
  END IF;
END $$;

-- THIS feature's own idempotency key. Two schedule calls for the same
-- (staff member, event, kind) — a retried request, a double-click, a cron
-- overlap — can only ever produce ONE row, so nobody is ever emailed twice
-- for the same event. Completely independent of StaffNotification.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_email_candidates_staff_source_kind
  ON team_email_notification_candidates (staff_id, source_id, kind);

-- The cron's scan predicate: "PENDING and due".
CREATE INDEX IF NOT EXISTS idx_team_email_candidates_status_due
  ON team_email_notification_candidates (status, scheduled_send_at);

-- Per-staff grouping for the batched send.
CREATE INDEX IF NOT EXISTS idx_team_email_candidates_staff_status_due
  ON team_email_notification_candidates (staff_id, status, scheduled_send_at);

-- The 15-minute per-staff cooldown lookup ("was this staff member emailed
-- recently?").
CREATE INDEX IF NOT EXISTS idx_team_email_candidates_staff_status_sent
  ON team_email_notification_candidates (staff_id, status, sent_at);

-- ── team_email_notification_preferences ──────────────────────────────────
-- Per-staff category toggles, ALL ON by default. A MISSING row means
-- "everything on" — application code never requires a row to exist, so no
-- backfill is needed and no staff action is required to start receiving
-- these emails. There is deliberately NO column for ordinary channel/group
-- message activity: it is never emailed at all, so there is nothing to
-- switch off.
CREATE TABLE IF NOT EXISTS team_email_notification_preferences (
  id                   text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  staff_id             text        NOT NULL UNIQUE REFERENCES "Staff"(id) ON DELETE CASCADE,
  direct_messages      boolean     NOT NULL DEFAULT true,
  mentions_and_threads boolean     NOT NULL DEFAULT true,
  missed_calls         boolean     NOT NULL DEFAULT true,
  invites              boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── updated_at maintenance ───────────────────────────────────────────────
-- Prisma stamps @updatedAt from the client on every write it performs, so
-- these triggers exist only so a hand-run SQL UPDATE (e.g. an operator
-- cancelling a stuck candidate in the SQL editor) keeps updated_at honest.
CREATE OR REPLACE FUNCTION team_email_notifications_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_team_email_candidates_touch'
  ) THEN
    CREATE TRIGGER trg_team_email_candidates_touch
      BEFORE UPDATE ON team_email_notification_candidates
      FOR EACH ROW EXECUTE FUNCTION team_email_notifications_touch_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_team_email_preferences_touch'
  ) THEN
    CREATE TRIGGER trg_team_email_preferences_touch
      BEFORE UPDATE ON team_email_notification_preferences
      FOR EACH ROW EXECUTE FUNCTION team_email_notifications_touch_updated_at();
  END IF;
END $$;

-- ── RLS — service-role only ──────────────────────────────────────────────
-- Identical posture to team_hub_v1_core.sql's 9 tables: this app has NO
-- Supabase-Auth-issued per-staff JWT, so RLS here can never be scoped to
-- "the requesting staff member's own rows". The REVOKE below is therefore
-- load-bearing and PERMANENT — it is what stops a holder of the public
-- anon key (readable in any deployed JS bundle) from reading who is being
-- emailed about what. Do NOT grant anon/authenticated SELECT on either
-- table to make some future client feature work; go through the existing
-- session-gated REST routes instead.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'team_email_notification_candidates',
    'team_email_notification_preferences'
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

-- ── Validation ───────────────────────────────────────────────
SELECT
  'team_email_notifications_v1_1' AS migration,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_email_notification_candidates')  AS candidates_table,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_email_notification_preferences') AS preferences_table,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'uq_team_email_candidates_staff_source_kind')          AS dedup_key,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_team_email_candidates_status_due')                AS cron_scan_index,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_team_email_candidates_staff_status_due')          AS staff_group_index,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_team_email_candidates_staff_status_sent')         AS cooldown_index,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_team_email_candidates_kind')                     AS kind_check,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_team_email_candidates_status')                   AS status_check,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'team_email_notification_candidates'
     AND policyname = 'service_all_team_email_notification_candidates')                                     AS rls_policy_sample,
  -- Proof this migration did NOT add a unique constraint to the EXISTING
  -- StaffNotification table (the unrelated, unmerged SLA-escalation work
  -- owns that decision — expect whatever was already there, unchanged).
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'StaffNotification')                                   AS staffnotification_indexes_untouched;
-- Expect: team_email_notifications_v1_1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | (pre-existing count, unchanged)
