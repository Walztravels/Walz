-- Quotes & Proposals system
-- Run this in the Supabase SQL editor after creating the proposal-assets storage bucket.

-- quotes
CREATE TABLE IF NOT EXISTS quotes (
  id                        TEXT PRIMARY KEY,
  reference                 TEXT UNIQUE NOT NULL,
  secure_token_hash         TEXT UNIQUE NOT NULL,
  client_name               TEXT NOT NULL,
  client_email              TEXT NOT NULL,
  client_phone              TEXT,
  client_country            TEXT,
  currency                  TEXT NOT NULL DEFAULT 'GBP',
  title                     TEXT NOT NULL,
  description               TEXT,
  status                    TEXT NOT NULL DEFAULT 'draft',
  version                   INTEGER NOT NULL DEFAULT 1,
  valid_until               TIMESTAMPTZ NOT NULL,
  created_by                TEXT NOT NULL,
  assigned_to               TEXT,
  sent_at                   TIMESTAMPTZ,
  first_viewed_at           TIMESTAMPTZ,
  last_viewed_at            TIMESTAMPTZ,
  view_count                INTEGER NOT NULL DEFAULT 0,
  accepted_at               TIMESTAMPTZ,
  declined_at               TIMESTAMPTZ,
  changes_requested_at      TIMESTAMPTZ,
  converted_at              TIMESTAMPTZ,
  selected_flight_option_id TEXT,
  selected_hotel_option_id  TEXT,
  converted_booking_id      TEXT,
  decline_reason            TEXT,
  changes_note              TEXT,
  accepted_version          INTEGER,
  accepted_ip               TEXT,
  accepted_user_agent       TEXT,
  client_signature_name     TEXT,
  deposit_minor             BIGINT,
  deposit_currency          TEXT,
  deposit_percentage        DECIMAL(5,2),
  subtotal_minor            BIGINT NOT NULL DEFAULT 0,
  total_minor               BIGINT NOT NULL DEFAULT 0,
  internal_notes            TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quote_items
CREATE TABLE IF NOT EXISTS quote_items (
  id                    TEXT PRIMARY KEY,
  quote_id              TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  supplier              TEXT,
  supplier_ref          TEXT,
  source_type           TEXT NOT NULL DEFAULT 'manual',
  cost_minor            BIGINT NOT NULL DEFAULT 0,
  markup_minor          BIGINT NOT NULL DEFAULT 0,
  service_fee_minor     BIGINT NOT NULL DEFAULT 0,
  selling_price_minor   BIGINT NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL,
  client_visible        BOOLEAN NOT NULL DEFAULT true,
  show_price_to_client  BOOLEAN NOT NULL DEFAULT true,
  client_note           TEXT,
  internal_note         TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quote_flight_options
CREATE TABLE IF NOT EXISTS quote_flight_options (
  id                    TEXT PRIMARY KEY,
  quote_id              TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  label                 TEXT,
  is_recommended        BOOLEAN NOT NULL DEFAULT false,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  airline               TEXT NOT NULL,
  airline_code          TEXT,
  airline_logo_url      TEXT,
  operating_airline     TEXT,
  trip_type             TEXT NOT NULL DEFAULT 'roundtrip',
  cabin_class           TEXT NOT NULL,
  fare_class            TEXT,
  fare_family           TEXT,
  is_refundable         BOOLEAN NOT NULL DEFAULT false,
  changes_allowed       BOOLEAN NOT NULL DEFAULT false,
  change_fee            TEXT,
  no_show_rule          TEXT,
  seat_included         BOOLEAN NOT NULL DEFAULT false,
  meal_included         BOOLEAN NOT NULL DEFAULT false,
  personal_item         TEXT,
  cabin_baggage         TEXT,
  checked_baggage       TEXT,
  checked_pieces        INTEGER,
  checked_weight        TEXT,
  duffel_offer_id       TEXT,
  cost_minor            BIGINT NOT NULL DEFAULT 0,
  markup_minor          BIGINT NOT NULL DEFAULT 0,
  service_fee_minor     BIGINT NOT NULL DEFAULT 0,
  selling_price_minor   BIGINT NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL,
  fare_expires_at       TIMESTAMPTZ,
  source_type           TEXT NOT NULL DEFAULT 'manual',
  client_note           TEXT,
  internal_note         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quote_flight_segments
CREATE TABLE IF NOT EXISTS quote_flight_segments (
  id                    TEXT PRIMARY KEY,
  flight_option_id      TEXT NOT NULL REFERENCES quote_flight_options(id) ON DELETE CASCADE,
  segment_order         INTEGER NOT NULL DEFAULT 0,
  origin_code           TEXT NOT NULL,
  origin_city           TEXT,
  origin_terminal       TEXT,
  departure_at          TIMESTAMPTZ NOT NULL,
  destination_code      TEXT NOT NULL,
  destination_city      TEXT,
  destination_terminal  TEXT,
  arrival_at            TIMESTAMPTZ NOT NULL,
  flight_number         TEXT,
  operating_carrier     TEXT,
  marketing_carrier     TEXT,
  aircraft              TEXT,
  duration_minutes      INTEGER,
  stops                 INTEGER NOT NULL DEFAULT 0,
  layover_minutes       INTEGER
);

-- quote_hotel_options
CREATE TABLE IF NOT EXISTS quote_hotel_options (
  id                    TEXT PRIMARY KEY,
  quote_id              TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  label                 TEXT,
  is_recommended        BOOLEAN NOT NULL DEFAULT false,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  hotel_name            TEXT NOT NULL,
  star_rating           INTEGER,
  address               TEXT,
  city                  TEXT,
  country               TEXT,
  description           TEXT,
  check_in              TIMESTAMPTZ NOT NULL,
  check_out             TIMESTAMPTZ NOT NULL,
  nights                INTEGER NOT NULL,
  rooms                 INTEGER NOT NULL DEFAULT 1,
  adults                INTEGER NOT NULL DEFAULT 2,
  children              INTEGER NOT NULL DEFAULT 0,
  room_type             TEXT,
  bed_type              TEXT,
  meal_plan             TEXT,
  breakfast_included    BOOLEAN NOT NULL DEFAULT false,
  check_in_time         TEXT,
  check_out_time        TEXT,
  cancellation_policy   TEXT,
  is_refundable         BOOLEAN NOT NULL DEFAULT false,
  amenities             TEXT[] NOT NULL DEFAULT '{}',
  supplier              TEXT,
  supplier_ref          TEXT,
  rate_expires_at       TIMESTAMPTZ,
  cost_minor            BIGINT NOT NULL DEFAULT 0,
  markup_minor          BIGINT NOT NULL DEFAULT 0,
  service_fee_minor     BIGINT NOT NULL DEFAULT 0,
  selling_price_minor   BIGINT NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL,
  show_per_night        BOOLEAN NOT NULL DEFAULT false,
  source_type           TEXT NOT NULL DEFAULT 'manual',
  client_note           TEXT,
  internal_note         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quote_media
CREATE TABLE IF NOT EXISTS quote_media (
  id                TEXT PRIMARY KEY,
  quote_id          TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  flight_option_id  TEXT REFERENCES quote_flight_options(id) ON DELETE SET NULL,
  hotel_option_id   TEXT REFERENCES quote_hotel_options(id) ON DELETE SET NULL,
  url               TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  filename          TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  caption           TEXT,
  alt_text          TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_hero           BOOLEAN NOT NULL DEFAULT false,
  client_visible    BOOLEAN NOT NULL DEFAULT true,
  media_type        TEXT NOT NULL DEFAULT 'image',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quote_versions
CREATE TABLE IF NOT EXISTS quote_versions (
  id            TEXT PRIMARY KEY,
  quote_id      TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  status        TEXT NOT NULL,
  snapshot_json JSONB NOT NULL,
  changed_by    TEXT NOT NULL,
  change_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quote_activity
CREATE TABLE IF NOT EXISTS quote_activity (
  id          TEXT PRIMARY KEY,
  quote_id    TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  actor       TEXT NOT NULL,
  actor_type  TEXT NOT NULL DEFAULT 'staff',
  event_type  TEXT NOT NULL,
  detail      TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quotes_status       ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_by   ON quotes(created_by);
CREATE INDEX IF NOT EXISTS idx_quotes_email        ON quotes(client_email);
CREATE INDEX IF NOT EXISTS idx_quotes_token_hash   ON quotes(secure_token_hash);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote   ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_qfo_quote           ON quote_flight_options(quote_id);
CREATE INDEX IF NOT EXISTS idx_qfs_option          ON quote_flight_segments(flight_option_id);
CREATE INDEX IF NOT EXISTS idx_qho_quote           ON quote_hotel_options(quote_id);
CREATE INDEX IF NOT EXISTS idx_qm_quote            ON quote_media(quote_id);
CREATE INDEX IF NOT EXISTS idx_qv_quote            ON quote_versions(quote_id);
CREATE INDEX IF NOT EXISTS idx_qa_quote            ON quote_activity(quote_id);
CREATE INDEX IF NOT EXISTS idx_qa_created          ON quote_activity(created_at);

-- RLS
ALTER TABLE quotes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_flight_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_flight_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_hotel_options  ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_media          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_activity       ENABLE ROW LEVEL SECURITY;

-- service_role bypass (Next.js API routes use service_role key via prisma)
CREATE POLICY "service_role_quotes"               ON quotes               FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_quote_items"          ON quote_items          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_quote_flight_options" ON quote_flight_options FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_quote_flight_segments" ON quote_flight_segments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_quote_hotel_options"  ON quote_hotel_options  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_quote_media"          ON quote_media          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_quote_versions"       ON quote_versions       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_quote_activity"       ON quote_activity       FOR ALL TO service_role USING (true) WITH CHECK (true);

-- updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'quotes_updated_at') THEN
    CREATE TRIGGER quotes_updated_at
      BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'quote_items_updated_at') THEN
    CREATE TRIGGER quote_items_updated_at
      BEFORE UPDATE ON quote_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'quote_flight_options_updated_at') THEN
    CREATE TRIGGER quote_flight_options_updated_at
      BEFORE UPDATE ON quote_flight_options FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'quote_hotel_options_updated_at') THEN
    CREATE TRIGGER quote_hotel_options_updated_at
      BEFORE UPDATE ON quote_hotel_options FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
