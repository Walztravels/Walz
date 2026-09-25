-- A2P CUSTOMER_CARE SMS V1 — ADDITIVE migration. Hand-run in the Supabase SQL
-- Editor (repo convention; never `prisma migrate` / `db push` against prod).
--
--   * Creates two NEW tables: consent_events, sms_messages.
--   * Touches NO existing table (consent_records, WhatsApp, Team Hub, Inbox,
--     SLA are all untouched). No backfill. No consent is created or changed.
--   * Idempotent: safe to re-run.
--   * RLS enabled with NO policies: the app connects with the service/DB role
--     (bypasses RLS); anon/authenticated PostgREST access is denied by default.

BEGIN;

CREATE TABLE IF NOT EXISTS consent_events (
  id                   TEXT        PRIMARY KEY,
  normalized_number    TEXT        NOT NULL,
  purpose              TEXT        NOT NULL,
  event_type           TEXT        NOT NULL,
  from_status          TEXT,
  to_status            TEXT,
  source               TEXT,
  capture_page         TEXT,
  disclosure_version   TEXT,
  ip_address           TEXT,
  user_agent           TEXT,
  evidence             TEXT,
  provider_message_sid TEXT,
  occurred_at          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT consent_events_purpose_chk
    CHECK (purpose IN ('SMS_CUSTOMER_CARE','SMS_MARKETING','WHATSAPP_MARKETING')),
  CONSTRAINT consent_events_type_chk
    CHECK (event_type IN ('GRANTED','REVOKED','REGRANT_BLOCKED','PROVIDER_START','PROVIDER_HELP'))
);
CREATE UNIQUE INDEX IF NOT EXISTS consent_events_provider_sid_type_key
  ON consent_events (provider_message_sid, event_type);
CREATE INDEX IF NOT EXISTS consent_events_number_purpose_time_idx
  ON consent_events (normalized_number, purpose, occurred_at);

CREATE TABLE IF NOT EXISTS sms_messages (
  id                   TEXT        PRIMARY KEY,
  direction            TEXT        NOT NULL,
  phone                TEXT        NOT NULL,
  body                 TEXT,
  classification       TEXT        NOT NULL,
  status               TEXT        NOT NULL,
  twilio_message_sid   TEXT,
  error_code           TEXT,
  error_message_safe   TEXT,
  consent_purpose      TEXT,
  client_id            TEXT,
  context_ref          TEXT,
  idempotency_key      TEXT,
  keyword_class        TEXT,
  status_updated_at    TIMESTAMP(3),
  created_at           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sms_messages_direction_chk CHECK (direction IN ('INBOUND','OUTBOUND')),
  CONSTRAINT sms_messages_classification_chk CHECK (classification IN ('SMS_CUSTOMER_CARE')),
  CONSTRAINT sms_messages_status_chk CHECK (status IN
    ('pending','queued','accepted','sending','sent','delivered','undelivered','failed','received'))
);
CREATE UNIQUE INDEX IF NOT EXISTS sms_messages_twilio_sid_key
  ON sms_messages (twilio_message_sid);
CREATE UNIQUE INDEX IF NOT EXISTS sms_messages_idempotency_key_key
  ON sms_messages (idempotency_key);
CREATE INDEX IF NOT EXISTS sms_messages_phone_created_idx
  ON sms_messages (phone, created_at);
CREATE INDEX IF NOT EXISTS sms_messages_status_idx
  ON sms_messages (status);

ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages   ENABLE ROW LEVEL SECURITY;

COMMIT;

-- VALIDATION (run after; expect: 2 | 0 | 0 | 0)
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('consent_events','sms_messages')) AS new_tables,
  (SELECT count(*) FROM consent_events) AS consent_events_rows,
  (SELECT count(*) FROM sms_messages)   AS sms_messages_rows,
  (SELECT count(*) FROM consent_records WHERE status='GRANTED' AND updated_at > now() - interval '1 minute') AS consent_rows_touched_now;
