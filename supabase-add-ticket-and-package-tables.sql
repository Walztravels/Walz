-- Missing production tables (confirmed by runtime errors 42P01):
--   generated_tickets  — ticket-generator history ("[ticket-generator] DB upsert error")
--   package_bookings   — package booking flow + Paystack/Flutterwave webhooks
-- Schemas derived from the exact INSERT/UPDATE statements in the code.
-- Run ONCE in the Supabase SQL editor. Idempotent — safe to re-run.

-- ── 1. Ticket Generator history ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_tickets (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ticket_reference text NOT NULL UNIQUE,
  client_id        text,
  client_name      text,
  client_email     text NOT NULL,
  ticket_type      text NOT NULL,
  ticket_data      jsonb,
  pdf_url          text,
  sent_to_client   boolean NOT NULL DEFAULT false,
  sent_at          timestamptz,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS generated_tickets_email_idx ON generated_tickets (client_email);
ALTER TABLE generated_tickets ENABLE ROW LEVEL SECURITY;

-- ── 2. Package bookings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS package_bookings (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  booking_ref         text NOT NULL UNIQUE,
  package_id          text NOT NULL,
  package_title       text NOT NULL,
  package_slug        text,
  client_name         text NOT NULL,
  client_email        text NOT NULL,
  client_phone        text,
  client_country      text,
  num_travellers      integer NOT NULL DEFAULT 1,
  special_requests    text,
  total_price         numeric(12,2),
  deposit_amount      numeric(12,2),
  currency            text NOT NULL DEFAULT 'USD',
  payment_status      text NOT NULL DEFAULT 'pending',
  payment_gateway     text,
  payment_currency    text,
  payment_intent_id   text,
  deposit_paid_at     timestamptz,
  deposit_amount_paid numeric(14,2),
  status              text NOT NULL DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS package_bookings_ref_idx    ON package_bookings (booking_ref);
CREATE INDEX IF NOT EXISTS package_bookings_email_idx  ON package_bookings (client_email);
CREATE INDEX IF NOT EXISTS package_bookings_status_idx ON package_bookings (payment_status);
ALTER TABLE package_bookings ENABLE ROW LEVEL SECURITY;

SELECT 'ticket + package tables ready' AS result;
