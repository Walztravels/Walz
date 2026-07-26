-- ComfortPass booking tracking table
-- Run in Supabase SQL editor (not prisma db push).
-- Purpose: idempotency lock, submission state, voucher storage, and audit trail
-- for all bookings dispatched to the ComfortPass B2B API.

CREATE TABLE IF NOT EXISTS comfortpass_bookings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID        NOT NULL REFERENCES concierge_requests(id) ON DELETE CASCADE,

  -- Idempotency: prevents duplicate POST /bookings calls for the same request+service+date
  fingerprint         TEXT        NOT NULL,
  submission_state    TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (submission_state IN ('pending', 'submitted', 'failed', 'manual_review')),

  -- ComfortPass identifiers
  cp_booking_id       TEXT,
  cp_booking_number   INTEGER,

  -- Booking snapshot (captured at submission time for audit)
  service_code        TEXT,
  airport_code        TEXT,
  service_date        DATE,
  service_time        TEXT,
  flight_number       TEXT,
  passenger_count     INTEGER,

  -- Financial — internal only; NEVER expose to Jade, customer routes, or NEXT_PUBLIC vars
  supplier_amount     NUMERIC(10, 2),
  supplier_currency   TEXT DEFAULT 'USD',

  -- Status from ComfortPass
  cp_status           TEXT,
  checkout_url        TEXT,   -- NULL for balance payments; this is expected and valid

  -- Voucher
  voucher_url         TEXT,
  voucher_status      TEXT CHECK (voucher_status IN ('pending', 'ready')),

  -- Error tracking
  error_code          TEXT,
  error_message       TEXT,

  -- Audit
  correlation_id      TEXT,
  submitted_at        TIMESTAMPTZ,
  last_status_check   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Only one submission lock per fingerprint (prevents duplicates)
  UNIQUE (fingerprint)
);

-- Only one active submission (pending or submitted) per concierge request
CREATE UNIQUE INDEX IF NOT EXISTS comfortpass_bookings_request_active_idx
  ON comfortpass_bookings (request_id)
  WHERE submission_state IN ('pending', 'submitted');

-- Fast lookup by CP booking ID for status polling
CREATE INDEX IF NOT EXISTS comfortpass_bookings_cp_booking_id_idx
  ON comfortpass_bookings (cp_booking_id)
  WHERE cp_booking_id IS NOT NULL;

-- RLS: only the service role (server-side) can access this table
ALTER TABLE comfortpass_bookings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'comfortpass_bookings' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON comfortpass_bookings
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_comfortpass_bookings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comfortpass_bookings_updated_at ON comfortpass_bookings;
CREATE TRIGGER comfortpass_bookings_updated_at
  BEFORE UPDATE ON comfortpass_bookings
  FOR EACH ROW EXECUTE FUNCTION update_comfortpass_bookings_updated_at();
