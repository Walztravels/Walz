-- Phase 3: Normalized itinerary child tables
-- Run this in the Supabase SQL editor (not via prisma db push)
-- These tables are the normalized form of the JSON blobs in the Itinerary model.
-- The JSON blobs remain the primary store during the migration window;
-- these tables are written to in parallel and will become canonical once all
-- existing data has been migrated.

-- ─── Days ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itinerary_days (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id    text        NOT NULL,
  external_id     text,                           -- maps to uid() id in JSON blob
  day_number      integer     NOT NULL,
  title           text,
  description     text,
  activities      text[]      DEFAULT '{}',
  accommodation   text,
  destination     text,
  meals           text,
  weather         text,
  dress_code      text,
  client_notes    text,                           -- shown to client
  internal_notes  text,                           -- admin-only
  "order"         integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(itinerary_id, day_number)
);

-- ─── Flights ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itinerary_flights (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id        text        NOT NULL,
  external_id         text,                       -- maps to uid() id in JSON blob
  "from"              text,
  "to"                text,
  airline             text,
  iata_code           text,
  flight_number       text,
  date                date,
  departure_time      text,
  arrival_time        text,
  class               text,
  pnr                 text,
  client_price        numeric,                    -- shown in pricing breakdown
  supplier_cost       numeric,                    -- internal, never client-facing
  status              text        DEFAULT 'pending',
  notes               text,
  supplier_id         text,                       -- FK to public.suppliers (cuid)
  duffel_order_id     text,                       -- links to confirmed Duffel order
  "order"             integer     DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ─── Hotels ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itinerary_hotels (
  id                              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id                    text        NOT NULL,
  external_id                     text,
  name                            text,
  location                        text,
  website_url                     text,
  check_in                        date,
  check_out                       date,
  room_type                       text,
  nights                          integer,
  client_price                    numeric,
  supplier_cost                   numeric,
  status                          text        DEFAULT 'pending',
  notes                           text,
  image_url                       text,
  supplier_id                     text,
  hotelbeds_cancellation_reference text,          -- links to Hotelbeds booking
  "order"                         integer     DEFAULT 0,
  created_at                      timestamptz DEFAULT now(),
  updated_at                      timestamptz DEFAULT now()
);

-- ─── Transfers ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itinerary_transfers (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id    text        NOT NULL,
  external_id     text,
  type            text,
  "from"          text,
  "to"            text,
  date            date,
  time            text,
  vehicle         text,
  provider        text,
  client_price    numeric,
  supplier_cost   numeric,
  notes           text,
  image_url       text,
  supplier_id     text,
  "order"         integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ─── Tours / Activities ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itinerary_tours (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id    text        NOT NULL,
  external_id     text,
  name            text,
  location        text,
  date            date,
  time            text,
  duration        text,
  provider        text,
  client_price    numeric,
  supplier_cost   numeric,
  notes           text,
  image_url       text,
  supplier_id     text,
  "order"         integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ─── Trains ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itinerary_trains (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id    text        NOT NULL,
  external_id     text,
  "from"          text,
  "to"            text,
  date            date,
  departure_time  text,
  arrival_time    text,
  train_number    text,
  class           text,
  provider        text,
  pnr             text,
  client_price    numeric,
  supplier_cost   numeric,
  notes           text,
  image_url       text,
  supplier_id     text,
  "order"         integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ─── Ferries ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itinerary_ferries (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id    text        NOT NULL,
  external_id     text,
  "from"          text,
  "to"            text,
  date            date,
  departure_time  text,
  arrival_time    text,
  operator        text,
  class           text,
  vessel          text,
  client_price    numeric,
  supplier_cost   numeric,
  notes           text,
  image_url       text,
  supplier_id     text,
  "order"         integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS itinerary_days_itinerary_id      ON itinerary_days(itinerary_id);
CREATE INDEX IF NOT EXISTS itinerary_flights_itinerary_id   ON itinerary_flights(itinerary_id);
CREATE INDEX IF NOT EXISTS itinerary_hotels_itinerary_id    ON itinerary_hotels(itinerary_id);
CREATE INDEX IF NOT EXISTS itinerary_transfers_itinerary_id ON itinerary_transfers(itinerary_id);
CREATE INDEX IF NOT EXISTS itinerary_tours_itinerary_id     ON itinerary_tours(itinerary_id);
CREATE INDEX IF NOT EXISTS itinerary_trains_itinerary_id    ON itinerary_trains(itinerary_id);
CREATE INDEX IF NOT EXISTS itinerary_ferries_itinerary_id   ON itinerary_ferries(itinerary_id);

-- Booking reference indexes for Phase 4 (booking link lookups)
CREATE INDEX IF NOT EXISTS itinerary_flights_duffel          ON itinerary_flights(duffel_order_id) WHERE duffel_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS itinerary_hotels_hotelbeds         ON itinerary_hotels(hotelbeds_cancellation_reference) WHERE hotelbeds_cancellation_reference IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- All reads/writes go through the service role key (admin API routes).
-- No anon key access is needed for these tables.

ALTER TABLE itinerary_days      ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_flights   ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_hotels    ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_tours     ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_trains    ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_ferries   ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS so no policy is needed for admin routes.
-- If anon/authenticated reads are ever needed, add explicit policies here.

-- ─── Margin view (Phase 8 reporting) ─────────────────────────────────────────

CREATE OR REPLACE VIEW itinerary_margin_summary AS
SELECT
  itinerary_id,
  SUM(client_price)  FILTER (WHERE client_price  IS NOT NULL) AS total_client_price,
  SUM(supplier_cost) FILTER (WHERE supplier_cost IS NOT NULL) AS total_supplier_cost,
  SUM(client_price - supplier_cost) FILTER (WHERE client_price IS NOT NULL AND supplier_cost IS NOT NULL) AS total_margin,
  COUNT(*) AS item_count
FROM (
  SELECT itinerary_id, client_price, supplier_cost FROM itinerary_flights
  UNION ALL
  SELECT itinerary_id, client_price, supplier_cost FROM itinerary_hotels
  UNION ALL
  SELECT itinerary_id, client_price, supplier_cost FROM itinerary_transfers
  UNION ALL
  SELECT itinerary_id, client_price, supplier_cost FROM itinerary_tours
  UNION ALL
  SELECT itinerary_id, client_price, supplier_cost FROM itinerary_trains
  UNION ALL
  SELECT itinerary_id, client_price, supplier_cost FROM itinerary_ferries
) all_items
GROUP BY itinerary_id;
