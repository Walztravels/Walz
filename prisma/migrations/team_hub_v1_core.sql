-- ============================================================
-- WALZ TEAM HUB V1 — CORE SCHEMA (idempotent, hand-run in the Supabase
-- SQL Editor). NEVER via prisma db push / prisma migrate — after running,
-- only `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is
-- returned for review only, per the standing implementation instruction.
--
-- Fully additive: creates 9 new tables, adds 0 columns to any existing
-- table, alters 0 existing tables. Matches this repository's established
-- Prisma `@map`/`@@map` convention (camelCase Prisma fields <-> snake_case
-- Postgres columns/tables, e.g. the V1.3 Quote-revision fields), not the
-- older PascalCase-quoted-identifier style used by pre-V1.3 hand-run
-- migrations — table/column names below are plain lowercase snake_case,
-- matching prisma/schema.prisma's "Team Hub (V1)" model block exactly.
--
-- Status/type fields use a plain TEXT column + CHECK constraint, not a
-- Postgres ENUM — this repo's own convention for every recent hand-run
-- migration (Quote.status, ConversationClientLink.linkMethod,
-- RoutingAgent.role), specifically because widening a CHECK constraint is
-- a trivial idempotent ALTER, whereas ALTER TYPE ... ADD VALUE has
-- transactional restrictions.
-- ============================================================

-- ── team_conversations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_conversations (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        text        NOT NULL,
  name        text,
  description text,
  slug        text        UNIQUE,
  visibility  text,
  joinable    boolean     NOT NULL DEFAULT true,
  dm_key      text        UNIQUE,
  archived    boolean     NOT NULL DEFAULT false,
  created_by  text        NOT NULL REFERENCES "Staff"(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_team_conversations_type'
  ) THEN
    ALTER TABLE team_conversations
      ADD CONSTRAINT chk_team_conversations_type CHECK (type IN ('DM','GROUP','CHANNEL'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_team_conversations_visibility'
  ) THEN
    ALTER TABLE team_conversations
      ADD CONSTRAINT chk_team_conversations_visibility
      CHECK (visibility IS NULL OR visibility IN ('PUBLIC','PRIVATE'));
  END IF;
  -- dmKey is only ever set for type='DM' — application code computes it as
  -- min(staffIdA, staffIdB) || ':' || max(staffIdA, staffIdB).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_team_conversations_dmkey_only_for_dm'
  ) THEN
    ALTER TABLE team_conversations
      ADD CONSTRAINT chk_team_conversations_dmkey_only_for_dm
      CHECK (type <> 'DM' OR dm_key IS NOT NULL);
  END IF;
END $$;

-- Database-level guarantee: at most one DM conversation between any two
-- staff members, ever — a partial unique index scoped to type='DM' rather
-- than a plain unique column, since dm_key is null for GROUP/CHANNEL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_conversations_dmkey
  ON team_conversations (dm_key) WHERE type = 'DM';

CREATE INDEX IF NOT EXISTS idx_team_conversations_type ON team_conversations (type);
CREATE INDEX IF NOT EXISTS idx_team_conversations_archived ON team_conversations (archived);

-- ── team_conversation_members ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_conversation_members (
  id                    text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id       text        NOT NULL REFERENCES team_conversations(id) ON DELETE CASCADE,
  staff_id              text        NOT NULL REFERENCES "Staff"(id) ON DELETE CASCADE,
  role                  text        NOT NULL DEFAULT 'member',
  last_read_message_id  text,
  last_read_at          timestamptz,
  muted_until           timestamptz,
  joined_at             timestamptz NOT NULL DEFAULT now(),
  left_at               timestamptz
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_team_conversation_members_role'
  ) THEN
    ALTER TABLE team_conversation_members
      ADD CONSTRAINT chk_team_conversation_members_role CHECK (role IN ('member','admin'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_conversation_members_conv_staff
  ON team_conversation_members (conversation_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_team_conversation_members_staff ON team_conversation_members (staff_id);
CREATE INDEX IF NOT EXISTS idx_team_conversation_members_conversation ON team_conversation_members (conversation_id);

-- ── team_messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_messages (
  id                text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id   text        NOT NULL REFERENCES team_conversations(id) ON DELETE CASCADE,
  author_id         text        NOT NULL REFERENCES "Staff"(id) ON DELETE RESTRICT,
  parent_message_id text        REFERENCES team_messages(id) ON DELETE SET NULL,
  body              text        NOT NULL,
  edited_at         timestamptz,
  deleted_at        timestamptz,
  deleted_by        text        REFERENCES "Staff"(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_messages_conversation_created
  ON team_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_team_messages_parent ON team_messages (parent_message_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_author ON team_messages (author_id);

-- ── team_message_reactions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_message_reactions (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id  text        NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  staff_id    text        NOT NULL REFERENCES "Staff"(id) ON DELETE CASCADE,
  emoji       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_message_reactions_msg_staff_emoji
  ON team_message_reactions (message_id, staff_id, emoji);
CREATE INDEX IF NOT EXISTS idx_team_message_reactions_message ON team_message_reactions (message_id);

-- ── team_mentions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_mentions (
  id                  text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id          text        NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  mentioned_staff_id  text        NOT NULL REFERENCES "Staff"(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_mentions_msg_staff
  ON team_mentions (message_id, mentioned_staff_id);
CREATE INDEX IF NOT EXISTS idx_team_mentions_staff_created
  ON team_mentions (mentioned_staff_id, created_at);

-- ── team_message_attachments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_message_attachments (
  id            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id    text        NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  storage_key   text        NOT NULL,
  filename      text        NOT NULL,
  content_type  text        NOT NULL,
  size_bytes    integer     NOT NULL,
  uploaded_by   text        NOT NULL REFERENCES "Staff"(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_message_attachments_message ON team_message_attachments (message_id);

-- ── team_calls ────────────────────────────────────────────────────────────
-- conference_name (GROUP/CHANNEL only): the Twilio <Conference> friendly
-- name, generated server-side at call-start and NEVER returned to the
-- browser — see prisma/schema.prisma's TeamCallRecord doc comment. Status
-- vocabulary is the union of the DM set (INITIATING..FAILED) and the
-- GROUP/CHANNEL set (STARTED, ACTIVE) added below — a single row is only
-- ever from one vocabulary, disambiguated by the parent conversation's type.
CREATE TABLE IF NOT EXISTS team_calls (
  id                text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id   text        NOT NULL REFERENCES team_conversations(id) ON DELETE CASCADE,
  caller_id         text        NOT NULL REFERENCES "Staff"(id) ON DELETE RESTRICT,
  participant_ids   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  conference_name   text,
  provider_call_id  text,
  status            text        NOT NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),
  answered_at       timestamptz,
  ended_at          timestamptz,
  duration_seconds  integer
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_team_calls_status'
  ) THEN
    ALTER TABLE team_calls
      ADD CONSTRAINT chk_team_calls_status
      CHECK (status IN (
        'INITIATING','RINGING','ANSWERED','DECLINED','BUSY','MISSED','ENDED','FAILED', -- DM
        'STARTED','ACTIVE'                                                             -- GROUP/CHANNEL (ENDED/FAILED shared with DM)
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_team_calls_conversation_started ON team_calls (conversation_id, started_at);
CREATE INDEX IF NOT EXISTS idx_team_calls_caller ON team_calls (caller_id);
CREATE INDEX IF NOT EXISTS idx_team_calls_conversation_status ON team_calls (conversation_id, status);

-- CONCURRENCY GUARANTEE (owner requirement — DB-level, not just app-level):
-- at most one non-terminal (STARTED or ACTIVE) call per GROUP/CHANNEL
-- conversation, ever, enforced at the database. DM calls never use these
-- two status values (see the CHECK above), so this index is a no-op for
-- DM rows — it only ever constrains GROUP/CHANNEL concurrency. Mirrors the
-- exact "partial unique index, app catches the race on insert and re-fetches
-- the winner" pattern already used for uq_team_conversations_dmkey above.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_calls_one_active_per_conversation
  ON team_calls (conversation_id) WHERE status IN ('STARTED', 'ACTIVE');

-- ── team_call_participants ───────────────────────────────────────────────
-- GROUP/CHANNEL call membership only (a DM call uses participant_ids
-- above). One row per (call, staff); left_at is stamped on leave and
-- cleared on rejoin. NEVER used as an authorization source by itself — the
-- join route re-checks live team_conversation_members, not this table, so
-- a removed member can never create a new row here even holding a stale
-- call id.
CREATE TABLE IF NOT EXISTS team_call_participants (
  id             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  call_record_id text        NOT NULL REFERENCES team_calls(id) ON DELETE CASCADE,
  staff_id       text        NOT NULL REFERENCES "Staff"(id) ON DELETE CASCADE,
  joined_at      timestamptz NOT NULL DEFAULT now(),
  left_at        timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_call_participants_call_staff
  ON team_call_participants (call_record_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_team_call_participants_call ON team_call_participants (call_record_id);

-- ── team_inbox_discussion_links ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_inbox_discussion_links (
  id                        text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id                text        NOT NULL UNIQUE REFERENCES team_messages(id) ON DELETE CASCADE,
  chatwoot_conversation_id  integer     NOT NULL,
  status                    text        NOT NULL DEFAULT 'OPEN',
  context_snapshot          jsonb,
  linked_by                 text        NOT NULL REFERENCES "Staff"(id) ON DELETE RESTRICT,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_team_inbox_discussion_links_status'
  ) THEN
    ALTER TABLE team_inbox_discussion_links
      ADD CONSTRAINT chk_team_inbox_discussion_links_status CHECK (status IN ('OPEN','ANSWERED','RESOLVED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_team_inbox_discussion_links_conv
  ON team_inbox_discussion_links (chatwoot_conversation_id);
-- Serves the Ask Team / Inbox clarification chip's "most recent link for
-- this Inbox conversation, filterable by status" lookup (lib/inbox/
-- action-status.ts) without a second round-trip.
CREATE INDEX IF NOT EXISTS idx_team_inbox_discussion_links_conv_status
  ON team_inbox_discussion_links (chatwoot_conversation_id, status);

-- ============================================================
-- ROW LEVEL SECURITY — service role only, same posture as
-- ConversationClientLink/webhook_events. ALL Team Hub reads/writes go
-- through Next.js server routes (service-role Prisma client) — the
-- browser never talks to these tables directly via an anon/authenticated
-- Postgres role. This is what makes every authorization decision above
-- (membership checks, Inbox-link authorization) actually enforceable —
-- if a browser could query these tables directly, no application-layer
-- check here would matter.
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'team_conversations','team_conversation_members','team_messages',
    'team_message_reactions','team_mentions','team_message_attachments',
    'team_calls','team_call_participants','team_inbox_discussion_links'
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

-- ============================================================
-- SUPABASE REALTIME — publication membership only, kept for a possible
-- future Broadcast-based design; the Team Hub CLIENT CODE DOES NOT AND
-- MUST NOT subscribe to postgres_changes on these tables (see
-- app/admin/team/hooks/useTeamRealtimeMessages.ts's header comment —
-- security review finding).
--
-- This app has NO Supabase-Auth-issued per-staff JWT (getAdminSession() is
-- a separate cookie-based identity system), so RLS here can never be
-- scoped to "the requesting staff member's own membership" the way a
-- Supabase-Auth app could with auth.uid(). The REVOKE ALL FROM anon,
-- authenticated above is therefore load-bearing and PERMANENT for these 8
-- tables: it is what stops an anon-key holder (anyone — the key is public,
-- readable in any deployed JS bundle) from reading Team Hub content
-- directly. Enabling this publication does NOT by itself let anon read
-- anything (a postgres_changes subscriber still needs table-level SELECT
-- grant, which anon/authenticated do not have here) — it only means the
-- WAL-level CDC stream exists, ready for a genuinely safe consumer.
--
-- DO NOT "fix" a future realtime feature by granting anon/authenticated
-- SELECT on any of these 8 tables to make a client subscription work —
-- that would leak every private DM/channel message to any unauthenticated
-- holder of the public anon key. The correct design for live push is a
-- Broadcast channel PUBLISHED SERVER-SIDE (via the service-role client)
-- only after each authz-checked REST write succeeds — that needs no
-- table-level grant to the browser at all, and is the only safe consumer
-- of the CDC stream this section enables.
-- ============================================================
ALTER TABLE team_messages REPLICA IDENTITY FULL;
ALTER TABLE team_conversation_members REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_conversation_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_conversation_members;
  END IF;
END $$;

-- ── Validation ───────────────────────────────────────────────
SELECT
  'team_hub_v1_core' AS migration,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_conversations') AS conversations,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_conversation_members') AS members,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_messages') AS messages,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_message_reactions') AS reactions,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_mentions') AS mentions,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_message_attachments') AS attachments,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_calls') AS calls,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_call_participants') AS call_participants,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'team_inbox_discussion_links') AS inbox_links,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'uq_team_conversations_dmkey') AS dm_uniqueness_index,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'uq_team_calls_one_active_per_conversation') AS group_call_uniqueness_index,
  (SELECT COUNT(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'team_messages') AS realtime_messages,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'team_conversations' AND policyname = 'service_all_team_conversations') AS rls_policy_sample;
-- Expect: team_hub_v1_core | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1
