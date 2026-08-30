-- itinerary_payments — manual/offline payment records for accepted itineraries.
-- Run this in the Supabase SQL editor (once).
-- The admin API uses the service role (getSupabaseAdmin) which bypasses RLS.

CREATE TABLE IF NOT EXISTS public.itinerary_payments (
  id                  UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id        TEXT          NOT NULL,   -- Itinerary.referenceNumber (e.g. IT-20250823-ABCD)
  acceptance_version  INTEGER       NOT NULL DEFAULT 2,
  amount              NUMERIC(12,2) NOT NULL,
  currency            TEXT          NOT NULL,   -- ISO 4217 e.g. USD, GBP, NGN
  type                TEXT          NOT NULL,   -- DEPOSIT | BALANCE | FULL | MANUAL
  method              TEXT          NOT NULL,   -- BANK_TRANSFER | MANUAL | STRIPE | PAYSTACK
  status              TEXT          NOT NULL DEFAULT 'PAID', -- PAID | PENDING | FAILED | REFUNDED
  provider_reference  TEXT,                    -- Paystack ref, bank ref, or MANUAL-{ref}-{ts}
  paid_at             TIMESTAMPTZ,
  notes               TEXT,
  recorded_by         TEXT,                    -- admin email/name who recorded the payment
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for fast per-itinerary payment lookups (used in every GET and overpayment guard)
CREATE INDEX IF NOT EXISTS idx_itinerary_payments_itinerary_id
  ON public.itinerary_payments (itinerary_id);

-- Index for PAID status filter (used in overpayment guard)
CREATE INDEX IF NOT EXISTS idx_itinerary_payments_status
  ON public.itinerary_payments (itinerary_id, status);

-- RLS: enable but grant access only to the service role (used by admin API)
ALTER TABLE public.itinerary_payments ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically — no explicit policy needed for it.
-- Block all authenticated and anon users from direct table access.
-- (The admin Next.js routes use getSupabaseAdmin() which is the service role key.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'itinerary_payments'
      AND policyname = 'No direct client access to itinerary_payments'
  ) THEN
    CREATE POLICY "No direct client access to itinerary_payments"
      ON public.itinerary_payments
      FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
