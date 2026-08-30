-- Audit trail for itinerary fulfilment item status changes and key events.
-- Run via: Supabase project → SQL Editor → paste and execute.

CREATE TABLE IF NOT EXISTS itinerary_fulfilment_audit (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id  TEXT        NOT NULL,  -- Prisma CUID of the Itinerary record
  item_id       UUID        NOT NULL,
  staff_id      TEXT        NOT NULL,
  event         TEXT        NOT NULL,  -- STATUS_CHANGED | PAYMENT_GATE_OVERRIDE | TRIP_CONFIRMED_EMAIL | FAILED | REFERENCE_CHANGED
  old_status    TEXT,
  new_status    TEXT,
  old_ref       TEXT,                  -- old supplier_reference (PNR etc.)
  new_ref       TEXT,                  -- new supplier_reference
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_audit_itinerary ON itinerary_fulfilment_audit (itinerary_id);
CREATE INDEX IF NOT EXISTS idx_fulfilment_audit_item      ON itinerary_fulfilment_audit (item_id);

ALTER TABLE itinerary_fulfilment_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_full_access ON itinerary_fulfilment_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);
