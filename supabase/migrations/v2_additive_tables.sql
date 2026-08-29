-- =============================================================================
-- V2 Additive Tables Migration
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- All tables: UUID PK, created_at, updated_at, RLS enabled,
--             service-role bypass policy, no public access.
-- =============================================================================

-- ─── Trigger: auto-update updated_at ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TABLE: itinerary_option_groups
-- Matches TypeScript type: OptionGroup
-- =============================================================================
-- ROLLBACK: DROP TABLE IF EXISTS itinerary_option_groups;

CREATE TABLE IF NOT EXISTS itinerary_option_groups (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- TEXT not UUID: Prisma generates CUIDs (not RFC-4122 UUIDs) for Itinerary.id
  itinerary_id            TEXT        NOT NULL,
  name                    TEXT        NOT NULL,
  description             TEXT,
  category                TEXT        NOT NULL
                            CHECK (category IN (
                              'FLIGHT', 'HOTEL', 'ROOM', 'TRANSFER',
                              'ACTIVITY', 'INSURANCE', 'ADDON', 'OTHER'
                            )),
  selection_mode          TEXT        NOT NULL
                            CHECK (selection_mode IN ('SINGLE', 'MULTIPLE')),
  pricing_mode            TEXT        NOT NULL
                            CHECK (pricing_mode IN ('REPLACEMENT', 'ADD_ON')),
  required                BOOLEAN     NOT NULL DEFAULT FALSE,
  min_selections          INTEGER     NOT NULL DEFAULT 0,
  max_selections          INTEGER     NOT NULL DEFAULT 1,
  sort_order              INTEGER     NOT NULL DEFAULT 0,
  active                  BOOLEAN     NOT NULL DEFAULT TRUE,
  client_visible          BOOLEAN     NOT NULL DEFAULT TRUE,
  locked_after_acceptance BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE itinerary_option_groups ENABLE ROW LEVEL SECURITY;

-- Service-role bypass: server routes using getSupabaseAdmin() get full access
DROP POLICY IF EXISTS "service_role_full_access" ON itinerary_option_groups;
CREATE POLICY "service_role_full_access"
  ON itinerary_option_groups
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_option_groups_itinerary_id
  ON itinerary_option_groups (itinerary_id);

-- Trigger
DROP TRIGGER IF EXISTS trg_option_groups_updated_at ON itinerary_option_groups;
CREATE TRIGGER trg_option_groups_updated_at
  BEFORE UPDATE ON itinerary_option_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- TABLE: itinerary_option_items
-- Matches TypeScript type: OptionItem
-- =============================================================================
-- ROLLBACK: DROP TABLE IF EXISTS itinerary_option_items;

CREATE TABLE IF NOT EXISTS itinerary_option_items (
  id                  UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id            UUID           NOT NULL
                        REFERENCES itinerary_option_groups (id) ON DELETE CASCADE,
  -- TEXT not UUID: Prisma generates CUIDs for Itinerary.id
  itinerary_id        TEXT           NOT NULL,
  name                TEXT           NOT NULL,
  description         TEXT,
  client_price        NUMERIC(12, 2) NOT NULL,
  currency            TEXT           NOT NULL,
  price_adjustment    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  recommended         BOOLEAN        NOT NULL DEFAULT FALSE,
  default_selected    BOOLEAN        NOT NULL DEFAULT FALSE,
  client_selectable   BOOLEAN        NOT NULL DEFAULT TRUE,
  active              BOOLEAN        NOT NULL DEFAULT TRUE,
  sort_order          INTEGER        NOT NULL DEFAULT 0,
  image_url           TEXT,
  quote_expires_at    TIMESTAMPTZ,
  -- INTERNAL columns — excluded from public DTOs
  supplier_cost       NUMERIC(12, 2),
  internal_margin     NUMERIC(12, 2),
  source_type         TEXT
                        CHECK (source_type IN (
                          'MANUAL', 'FLIGHT_BOOKING', 'HOTEL_BOOKING',
                          'TRANSFER_BOOKING', 'TOUR_BOOKING'
                        )),
  source_booking_ref  TEXT,
  metadata            JSONB,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

ALTER TABLE itinerary_option_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON itinerary_option_items;
CREATE POLICY "service_role_full_access"
  ON itinerary_option_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_option_items_itinerary_id
  ON itinerary_option_items (itinerary_id);

CREATE INDEX IF NOT EXISTS idx_option_items_group_id
  ON itinerary_option_items (group_id);

-- Trigger
DROP TRIGGER IF EXISTS trg_option_items_updated_at ON itinerary_option_items;
CREATE TRIGGER trg_option_items_updated_at
  BEFORE UPDATE ON itinerary_option_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- TABLE: itinerary_payments
-- Matches TypeScript type: PaymentRecord
-- =============================================================================
-- ROLLBACK: DROP TABLE IF EXISTS itinerary_payments;

CREATE TABLE IF NOT EXISTS itinerary_payments (
  id                   UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  -- TEXT not UUID: Prisma generates CUIDs for Itinerary.id
  itinerary_id         TEXT           NOT NULL,
  acceptance_version   SMALLINT       NOT NULL CHECK (acceptance_version IN (1, 2)),
  amount               NUMERIC(12, 2) NOT NULL,
  currency             TEXT           NOT NULL,
  type                 TEXT           NOT NULL
                         CHECK (type IN ('DEPOSIT', 'BALANCE', 'FULL', 'OTHER')),
  method               TEXT           NOT NULL
                         CHECK (method IN (
                           'STRIPE', 'PAYSTACK', 'BANK_TRANSFER', 'CRYPTO', 'MANUAL'
                         )),
  status               TEXT           NOT NULL
                         CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  provider_reference   TEXT,
  paid_at              TIMESTAMPTZ,
  created_by_staff_id  TEXT,                       -- INTERNAL — never in public DTOs
  notes                TEXT,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

ALTER TABLE itinerary_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON itinerary_payments;
CREATE POLICY "service_role_full_access"
  ON itinerary_payments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_itinerary_id
  ON itinerary_payments (itinerary_id);

-- Idempotency guard: duplicate webhook deliveries with the same provider reference
-- are blocked at the DB level, preventing double-charging.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_reference_unique
  ON itinerary_payments (provider_reference)
  WHERE provider_reference IS NOT NULL;

-- Trigger
DROP TRIGGER IF EXISTS trg_payments_updated_at ON itinerary_payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON itinerary_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- TABLE: itinerary_fulfilment_items
-- Matches TypeScript type: FulfilmentItem
-- =============================================================================
-- ROLLBACK: DROP TABLE IF EXISTS itinerary_fulfilment_items;

CREATE TABLE IF NOT EXISTS itinerary_fulfilment_items (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- TEXT not UUID: Prisma generates CUIDs for Itinerary.id
  itinerary_id        TEXT        NOT NULL,
  type                TEXT        NOT NULL
                        CHECK (type IN (
                          'FLIGHT', 'HOTEL', 'TRANSFER', 'TOUR',
                          'TRAIN', 'FERRY', 'ESIM', 'OTHER'
                        )),
  description         TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN (
                          'PENDING', 'IN_PROGRESS', 'BOOKED',
                          'CONFIRMED', 'FAILED', 'CANCELLED'
                        )),
  supplier_reference  TEXT,
  client_reference    TEXT,
  assigned_to         TEXT,
  notes               TEXT,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE itinerary_fulfilment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON itinerary_fulfilment_items;
CREATE POLICY "service_role_full_access"
  ON itinerary_fulfilment_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fulfilment_items_itinerary_id
  ON itinerary_fulfilment_items (itinerary_id);

-- Trigger
DROP TRIGGER IF EXISTS trg_fulfilment_items_updated_at ON itinerary_fulfilment_items;
CREATE TRIGGER trg_fulfilment_items_updated_at
  BEFORE UPDATE ON itinerary_fulfilment_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
