-- Airport Services extension for Walz Concierge
-- Run in Supabase SQL editor.
-- Adds 'pending_payment' to the concierge_requests status enum,
-- seeds the airport-services category if missing,
-- and notes that the comfortpass_bookings table already exists.

-- 1. Extend concierge_requests.status to include pending_payment
--    (the status column is TEXT with a CHECK constraint from the core migration)
DO $$
BEGIN
  -- Drop and recreate the status check to add pending_payment
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'concierge_requests' AND constraint_name = 'concierge_requests_status_check'
  ) THEN
    ALTER TABLE concierge_requests DROP CONSTRAINT concierge_requests_status_check;
  END IF;
END $$;

ALTER TABLE concierge_requests
  ADD CONSTRAINT concierge_requests_status_check
  CHECK (status IN ('pending', 'pending_payment', 'quoted', 'confirmed', 'in_progress', 'completed', 'cancelled'));

-- 2. Seed the airport-services category (idempotent)
INSERT INTO concierge_categories (
  id,
  slug,
  name,
  description,
  icon,
  fulfilment_modes,
  required_fields,
  is_active,
  display_order,
  metadata
)
VALUES (
  gen_random_uuid(),
  'airport-services',
  'Airport Services',
  'Lounge access, meet & greet, transfers, sleeping pods and baggage delivery — all arranged by your personal concierge.',
  '✈',
  '["instant"]',
  '[
    {"key":"airport_code","label":"Airport","type":"text","required":true},
    {"key":"service_type","label":"Service type (lounge, meet & greet, transfer, pod, baggage)","type":"select","required":true,"options":["lounge","meet-greet","transfer","sleeping-pod","baggage"]},
    {"key":"date","label":"Service date","type":"date","required":true},
    {"key":"time","label":"Flight time","type":"text","required":true},
    {"key":"flight_number","label":"Flight number","type":"text","required":true},
    {"key":"passenger_count","label":"Number of passengers","type":"number","required":true},
    {"key":"passenger_names","label":"Passenger names","type":"text","required":false}
  ]',
  true,
  1,
  '{"comfortpass":true,"self_service":true}'
)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active   = true,
  metadata    = EXCLUDED.metadata;

-- 3. Seed the ComfortPass supplier (idempotent)
INSERT INTO concierge_suppliers (
  id,
  slug,
  name,
  adapter_type,
  category_slugs,
  is_active,
  metadata
)
VALUES (
  gen_random_uuid(),
  'comfortpass',
  'ComfortPass',
  'comfortpass',
  '["airport-services"]',
  true,
  '{"integration":"b2b_api","balance_payment":true}'
)
ON CONFLICT (slug) DO UPDATE SET
  adapter_type    = 'comfortpass',
  category_slugs  = '["airport-services"]',
  is_active       = true;

-- 4. Add stripe_session_id column to concierge_requests for audit (idempotent)
ALTER TABLE concierge_requests
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

-- Note: comfortpass_bookings table was created in migration 20260726_comfortpass_bookings.sql
-- No changes needed there.
