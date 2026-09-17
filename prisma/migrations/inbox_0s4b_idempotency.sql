-- ============================================================
-- INBOX-0S.4B — WEBHOOK IDEMPOTENCY (idempotent, hand-run)
-- Run in Supabase SQL Editor ONLY AFTER (1) inbox_0s4_duplicate_audit.sql
-- came back clean for messages/visa sections and (2)
-- inbox_0s4a_lead_cleanup.sql has been run (the separate, auditable
-- duplicate cleanup — destructive work is never folded in here).
-- This script never deletes data; it simply FAILS on step 1/3 if
-- unexpected duplicates exist.
-- ============================================================

-- 1. Provider message ids become database-enforced unique.
--    (Chatwoot cw_msg_<id> and WhatsApp Cloud wamid both live here.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_external_id
  ON messages (external_id)
  WHERE external_id IS NOT NULL;

-- 2. Cross-provider processed-event ledger. INSERT ... ON CONFLICT DO
--    NOTHING is the idempotency gate: the first delivery wins, retries
--    and concurrent duplicates see a conflict and skip side effects.
--    Used by the Meta webhook (event id = message mid), where messages
--    are stored inside Lead.conversation JSON and no unique column can
--    protect them.
CREATE TABLE IF NOT EXISTS webhook_events (
  id          bigserial   PRIMARY KEY,
  provider    text        NOT NULL,      -- 'meta' | 'chatwoot' | 'twilio' | ...
  event_id    text        NOT NULL,      -- provider message/event id (mid, wamid, sid)
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_webhook_events UNIQUE (provider, event_id)
);
-- Housekeeping index for pruning by age (optional cron later).
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON webhook_events (received_at);

-- RLS: SERVICE ROLE ONLY (security review H1). The ledger gates message
-- processing — if anon/authenticated could write it, pre-inserted claims
-- would silently suppress real customer messages (an anonymous Jade kill
-- switch) and deletes would re-enable duplicates. Lock it down explicitly.
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE webhook_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE webhook_events_id_seq FROM anon, authenticated;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'webhook_events' AND policyname = 'service_all_webhook_events'
  ) THEN
    CREATE POLICY service_all_webhook_events ON webhook_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Twilio inbound retries must not duplicate visa thread messages.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visa_message_twilio_sid
  ON "VisaApplicationMessage" ("twilioSid")
  WHERE "twilioSid" IS NOT NULL;

-- 4. Atomic unread increment — replaces the read-modify-write in the
--    Chatwoot webhook that lost updates under concurrent deliveries.
CREATE OR REPLACE FUNCTION increment_lead_unread(
  p_lead_id  text,
  p_preview  text,
  p_at       timestamptz
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE leads
  SET unread_count         = COALESCE(unread_count, 0) + 1,
      last_message_at      = p_at,
      last_message_preview = p_preview
  WHERE id = p_lead_id::uuid;   -- leads.id is uuid in production; callers pass text
$$;

-- ── Validation ───────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'uq_messages_external_id')     AS uq_messages,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'uq_visa_message_twilio_sid')  AS uq_visa_sid,
  (SELECT COUNT(*) FROM information_schema.tables  WHERE table_name = 'webhook_events') AS webhook_events_table,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'increment_lead_unread')            AS unread_fn;
-- Expect: 1 | 1 | 1 | 1
