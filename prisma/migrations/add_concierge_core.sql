-- =============================================================================
-- Walz Concierge Core — Full Schema Migration
-- Run via Supabase SQL editor ONLY. Never use prisma db push.
-- After running: npx prisma generate (not migrate)
-- =============================================================================

-- ── 1. Reference sequence ──────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS concierge_request_seq START 1;

CREATE OR REPLACE FUNCTION next_concierge_reference()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'WC-' || EXTRACT(YEAR FROM now())::text
       || '-' || LPAD(nextval('concierge_request_seq')::text, 3, '0');
$$;

-- ── 2. Categories (database-driven catalogue — no hardcoded slugs in code) ─

CREATE TABLE IF NOT EXISTS concierge_categories (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug            text        UNIQUE NOT NULL,
  name            text        NOT NULL,
  description     text,
  icon            text,
  fulfilment_modes text[]     DEFAULT '{}',     -- instant | request_to_book | bespoke
  required_fields jsonb       DEFAULT '[]',     -- [{ key, label, type, required, options? }]
  is_active       boolean     DEFAULT true,
  display_order   integer     DEFAULT 0,
  metadata        jsonb       DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concierge_categories_slug_idx    ON concierge_categories(slug);
CREATE INDEX IF NOT EXISTS concierge_categories_active_idx  ON concierge_categories(is_active, display_order);

ALTER TABLE concierge_categories ENABLE ROW LEVEL SECURITY;

-- ── 3. Suppliers ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS concierge_suppliers (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug            text        UNIQUE NOT NULL,
  name            text        NOT NULL,
  adapter_type    text        NOT NULL DEFAULT 'manual', -- manual | api | gds
  contact_email   text,
  contact_phone   text,
  category_slugs  text[]      DEFAULT '{}',   -- which categories this supplier serves
  is_active       boolean     DEFAULT true,
  metadata        jsonb       DEFAULT '{}',   -- non-sensitive config (webhook URLs etc.)
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
  -- NOTE: API credentials are NEVER stored here. They live in Vercel env vars.
);

CREATE INDEX IF NOT EXISTS concierge_suppliers_active_idx   ON concierge_suppliers(is_active);
CREATE INDEX IF NOT EXISTS concierge_suppliers_category_idx ON concierge_suppliers USING GIN(category_slugs);

ALTER TABLE concierge_suppliers ENABLE ROW LEVEL SECURITY;

-- ── 4. Products ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS concierge_products (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id     uuid        REFERENCES concierge_categories(id) ON DELETE CASCADE,
  supplier_id     uuid        REFERENCES concierge_suppliers(id)  ON DELETE SET NULL,
  name            text        NOT NULL,
  description     text,
  base_price      jsonb       DEFAULT '{}',   -- { amount: number, currency: string, unit: string }
  attributes      jsonb       DEFAULT '{}',   -- product-specific config
  is_active       boolean     DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concierge_products_category_idx  ON concierge_products(category_id);
CREATE INDEX IF NOT EXISTS concierge_products_supplier_idx  ON concierge_products(supplier_id);
CREATE INDEX IF NOT EXISTS concierge_products_active_idx    ON concierge_products(is_active);

ALTER TABLE concierge_products ENABLE ROW LEVEL SECURITY;

-- ── 5. Pricing Rules ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS concierge_pricing_rules (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  applies_to      text        NOT NULL, -- 'category' | 'product' | 'supplier' | 'global'
  target_id       uuid,                 -- category_id or product_id (null for global)
  rule_type       text        NOT NULL, -- 'fixed_markup' | 'percentage_markup' | 'seasonal' | 'volume'
  conditions      jsonb       DEFAULT '{}',  -- e.g. { minPax: 10, dateRange: [...] }
  modifier        jsonb       DEFAULT '{}',  -- e.g. { type: 'percent', value: 15 }
  priority        integer     DEFAULT 0,     -- higher priority applied first
  is_active       boolean     DEFAULT true,
  valid_from      timestamptz,
  valid_until     timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concierge_pricing_active_idx ON concierge_pricing_rules(is_active, priority DESC);

ALTER TABLE concierge_pricing_rules ENABLE ROW LEVEL SECURITY;

-- ── 6. Inventory ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS concierge_inventory (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      uuid        REFERENCES concierge_products(id)  ON DELETE CASCADE,
  supplier_id     uuid        REFERENCES concierge_suppliers(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  available_units integer     DEFAULT -1,  -- -1 = unlimited / on-request
  reserved_units  integer     DEFAULT 0,
  notes           text,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(product_id, supplier_id, date)
);

CREATE INDEX IF NOT EXISTS concierge_inventory_date_idx ON concierge_inventory(date);

ALTER TABLE concierge_inventory ENABLE ROW LEVEL SECURITY;

-- ── 7. Requests ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS concierge_requests (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  reference       text        UNIQUE NOT NULL,            -- WC-2026-001
  jade_session_id text        NOT NULL,
  chatwoot_conv_id bigint,
  category_id     uuid        REFERENCES concierge_categories(id) ON DELETE RESTRICT,
  fulfilment_mode text        NOT NULL,                   -- instant | request_to_book | bespoke
  status          text        DEFAULT 'pending',           -- pending | quoted | confirmed | in_progress | completed | cancelled
  intent_fields   jsonb       NOT NULL DEFAULT '{}',       -- all Jade-collected fields
  client_name     text,
  client_email    text,
  client_phone    text,
  sla_deadline    timestamptz,
  assigned_to     text,                                    -- staff email — NEVER sent to Jade
  internal_notes  text,                                    -- ops notes — NEVER sent to Jade
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concierge_requests_session_idx   ON concierge_requests(jade_session_id);
CREATE INDEX IF NOT EXISTS concierge_requests_status_idx    ON concierge_requests(status);
CREATE INDEX IF NOT EXISTS concierge_requests_created_idx   ON concierge_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS concierge_requests_category_idx  ON concierge_requests(category_id);
CREATE INDEX IF NOT EXISTS concierge_requests_conv_idx      ON concierge_requests(chatwoot_conv_id);

ALTER TABLE concierge_requests ENABLE ROW LEVEL SECURITY;

-- ── 8. Quotes ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS concierge_quotes (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id          uuid        REFERENCES concierge_requests(id) ON DELETE CASCADE,
  product_id          uuid        REFERENCES concierge_products(id) ON DELETE SET NULL,
  supplier_id         uuid        REFERENCES concierge_suppliers(id) ON DELETE SET NULL,
  quoted_price        jsonb       NOT NULL DEFAULT '{}',  -- { amount, currency }
  pricing_breakdown   jsonb       DEFAULT '{}',            -- line items — NEVER sent to Jade
  valid_until         timestamptz,
  status              text        DEFAULT 'draft',          -- draft | sent | accepted | rejected | expired
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concierge_quotes_request_idx ON concierge_quotes(request_id);
CREATE INDEX IF NOT EXISTS concierge_quotes_status_idx  ON concierge_quotes(status);

ALTER TABLE concierge_quotes ENABLE ROW LEVEL SECURITY;

-- ── 9. Bookings ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS concierge_bookings (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id        uuid        REFERENCES concierge_quotes(id)   ON DELETE SET NULL,
  request_id      uuid        REFERENCES concierge_requests(id) ON DELETE CASCADE,
  confirmation_ref text,                                   -- supplier confirmation code
  status          text        DEFAULT 'confirmed',          -- confirmed | in_progress | completed | cancelled
  booked_at       timestamptz DEFAULT now(),
  service_date    timestamptz,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concierge_bookings_request_idx ON concierge_bookings(request_id);
CREATE INDEX IF NOT EXISTS concierge_bookings_status_idx  ON concierge_bookings(status);

ALTER TABLE concierge_bookings ENABLE ROW LEVEL SECURITY;

-- ── 10. Fulfilment ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS concierge_fulfilment (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id          uuid        REFERENCES concierge_requests(id) ON DELETE CASCADE,
  booking_id          uuid        REFERENCES concierge_bookings(id) ON DELETE SET NULL,
  supplier_id         text        NOT NULL,                -- supplier slug or 'walz-operations'
  adapter_type        text        NOT NULL DEFAULT 'manual',
  dispatch_status     text        DEFAULT 'pending',        -- pending | dispatched | acknowledged | completed | failed
  supplier_ref        text,
  dispatch_payload    jsonb       DEFAULT '{}',             -- what was sent to the adapter
  dispatch_response   jsonb       DEFAULT '{}',             -- what the adapter returned
  dispatched_at       timestamptz,
  acknowledged_at     timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concierge_fulfilment_request_idx ON concierge_fulfilment(request_id);
CREATE INDEX IF NOT EXISTS concierge_fulfilment_status_idx  ON concierge_fulfilment(dispatch_status);

ALTER TABLE concierge_fulfilment ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Default manual operations supplier (fallback when no supplier configured for a category)
INSERT INTO concierge_suppliers (slug, name, adapter_type, contact_email, category_slugs, is_active)
VALUES (
  'walz-operations',
  'Walz Operations',
  'manual',
  'contact@walztravels.com',
  ARRAY['airport-services','executive-transport','private-aviation','yacht-marine','lifestyle','tickets','vip-experiences'],
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Initial 7 concierge categories
INSERT INTO concierge_categories (slug, name, description, fulfilment_modes, required_fields, display_order, is_active) VALUES

('airport-services', 'Airport Services',
 'Fast-track security, meet & greet, lounge access, porter and baggage assistance.',
 ARRAY['request_to_book'],
 '[
   {"key":"airport","label":"Airport","type":"text","required":true},
   {"key":"flight_number","label":"Flight number","type":"text","required":true},
   {"key":"date","label":"Date of travel","type":"date","required":true},
   {"key":"pax","label":"Number of passengers","type":"number","required":true},
   {"key":"services","label":"Services needed (fast-track, lounge, porter, meet & greet)","type":"text","required":false}
 ]',
 1, true),

('executive-transport', 'Executive Transport',
 'Chauffeur, limousine, SUV, and VIP fleet transfers for any occasion.',
 ARRAY['instant','request_to_book'],
 '[
   {"key":"pickup","label":"Pickup location","type":"text","required":true},
   {"key":"destination","label":"Destination","type":"text","required":true},
   {"key":"date","label":"Date & time","type":"text","required":true},
   {"key":"pax","label":"Number of passengers","type":"number","required":true},
   {"key":"vehicle","label":"Vehicle preference (sedan, SUV, limousine)","type":"text","required":false}
 ]',
 2, true),

('private-aviation', 'Private Aviation',
 'Private jet, turboprop, and helicopter charters worldwide.',
 ARRAY['bespoke'],
 '[
   {"key":"origin","label":"Departure airport or city","type":"text","required":true},
   {"key":"destination","label":"Destination airport or city","type":"text","required":true},
   {"key":"date","label":"Departure date","type":"date","required":true},
   {"key":"pax","label":"Number of passengers","type":"number","required":true},
   {"key":"aircraft","label":"Aircraft preference (jet, turboprop, helicopter)","type":"text","required":false},
   {"key":"catering","label":"Catering requirements","type":"text","required":false}
 ]',
 3, true),

('yacht-marine', 'Yacht & Marine',
 'Superyacht, gulet, and speedboat charters. Day trips to extended voyages.',
 ARRAY['bespoke'],
 '[
   {"key":"destination","label":"Sailing destination or region","type":"text","required":true},
   {"key":"start_date","label":"Charter start date","type":"date","required":true},
   {"key":"duration","label":"Duration (days)","type":"number","required":true},
   {"key":"pax","label":"Number of guests","type":"number","required":true},
   {"key":"budget","label":"Budget indication","type":"text","required":false},
   {"key":"preferences","label":"Preferences (crew, catering, itinerary)","type":"text","required":false}
 ]',
 4, true),

('lifestyle', 'Lifestyle Concierge',
 'Restaurant reservations, personal shopping, wellness bookings, and curated local experiences.',
 ARRAY['request_to_book'],
 '[
   {"key":"service_type","label":"Service type (restaurant, shopping, wellness, other)","type":"text","required":true},
   {"key":"location","label":"City or location","type":"text","required":true},
   {"key":"date","label":"Preferred date","type":"date","required":true},
   {"key":"pax","label":"Number of guests","type":"number","required":false},
   {"key":"preferences","label":"Preferences or requirements","type":"text","required":false}
 ]',
 5, true),

('tickets', 'Tickets & Entertainment',
 'VIP tickets for sports, concerts, theatre, Formula 1, and premium events worldwide.',
 ARRAY['request_to_book'],
 '[
   {"key":"event","label":"Event name or type","type":"text","required":true},
   {"key":"location","label":"Venue city","type":"text","required":true},
   {"key":"date","label":"Event date","type":"date","required":true},
   {"key":"pax","label":"Number of tickets","type":"number","required":true},
   {"key":"tier","label":"Ticket tier (standard, VIP, hospitality suite)","type":"text","required":false}
 ]',
 6, true),

('vip-experiences', 'VIP Experiences',
 'Bespoke white-glove packages — anniversaries, proposals, corporate events, bucket-list moments.',
 ARRAY['bespoke'],
 '[
   {"key":"occasion","label":"Occasion or purpose","type":"text","required":true},
   {"key":"destination","label":"Destination or location","type":"text","required":true},
   {"key":"date","label":"Preferred dates","type":"text","required":true},
   {"key":"pax","label":"Number of guests","type":"number","required":true},
   {"key":"budget","label":"Budget indication","type":"text","required":false},
   {"key":"requirements","label":"Special requirements or preferences","type":"text","required":false}
 ]',
 7, true)

ON CONFLICT (slug) DO UPDATE SET
  name            = EXCLUDED.name,
  description     = EXCLUDED.description,
  fulfilment_modes = EXCLUDED.fulfilment_modes,
  required_fields = EXCLUDED.required_fields,
  display_order   = EXCLUDED.display_order,
  updated_at      = now();

-- =============================================================================
-- VERIFICATION (run after migration to confirm)
-- =============================================================================
-- SELECT slug, name, fulfilment_modes FROM concierge_categories ORDER BY display_order;
-- SELECT slug, name, adapter_type FROM concierge_suppliers;
-- SELECT next_concierge_reference();  -- should return WC-YYYY-001
