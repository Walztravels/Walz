-- ═══════════════════════════════════════════════════════════════════
-- Phases 4–16 Workspace Tables
-- Run in the Supabase SQL editor. Do NOT run via prisma db push.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE throughout).
-- ═══════════════════════════════════════════════════════════════════

-- ─── Travelers per itinerary (Phase 10 / Traveler Readiness) ────────

CREATE TABLE IF NOT EXISTS itinerary_travelers (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id     text        NOT NULL,
  full_name        text        NOT NULL,
  email            text,
  phone            text,
  date_of_birth    date,
  nationality      text,
  passport_number  text,        -- store masked; full number in secure vault only
  passport_expiry  date,
  passport_country text,
  lead_traveler    boolean     DEFAULT false,
  notes            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itin_travelers_itin ON itinerary_travelers(itinerary_id);
ALTER TABLE itinerary_travelers ENABLE ROW LEVEL SECURITY;

-- ─── Tasks per itinerary (Phase 13 / Workflow) ──────────────────────

CREATE TABLE IF NOT EXISTS itinerary_tasks (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id    text        NOT NULL,
  title           text        NOT NULL,
  description     text,
  owner           text,                           -- staff email/name
  due_date        date,
  priority        text        DEFAULT 'medium',   -- low | medium | high | urgent
  status          text        DEFAULT 'pending',  -- pending | in_progress | done | cancelled
  category        text,                           -- visa | flight | hotel | payment | document | transfer | esim | supplier | follow_up
  client_visible  boolean     DEFAULT false,
  auto_generated  boolean     DEFAULT false,
  supplier_ref    text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itin_tasks_itin ON itinerary_tasks(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itin_tasks_status ON itinerary_tasks(status);
ALTER TABLE itinerary_tasks ENABLE ROW LEVEL SECURITY;

-- ─── Version history (Phase 4 / Block Editor) ───────────────────────

CREATE TABLE IF NOT EXISTS itinerary_versions (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id   text        NOT NULL,
  version_number integer     NOT NULL,
  snapshot       jsonb       NOT NULL,            -- full Itinerary state snapshot
  saved_by       text,                            -- staff email
  note           text,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(itinerary_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_itin_versions_itin ON itinerary_versions(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itin_versions_num  ON itinerary_versions(itinerary_id, version_number DESC);
ALTER TABLE itinerary_versions ENABLE ROW LEVEL SECURITY;

-- ─── eSIM assignments per itinerary (Phase 9 / eSIM Integration) ────

CREATE TABLE IF NOT EXISTS itinerary_esims (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id          text        NOT NULL,
  traveler_name         text,
  package_code          text,
  package_name          text,
  provider              text        DEFAULT 'airalo',
  destination_countries text[]      DEFAULT '{}',
  data_amount           text,
  validity_days         integer,
  wholesale_cost        numeric,
  client_price          numeric,
  currency              text        DEFAULT 'USD',
  status                text        DEFAULT 'recommended',
  -- recommended | added | purchased | issued | installed | activated
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itin_esims_itin ON itinerary_esims(itinerary_id);
ALTER TABLE itinerary_esims ENABLE ROW LEVEL SECURITY;

-- ─── Internal notes per itinerary (Phase 3 / Workspace) ─────────────

CREATE TABLE IF NOT EXISTS itinerary_internal_notes (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id   text        NOT NULL,
  author         text        NOT NULL,            -- staff email/name
  body           text        NOT NULL,
  pinned         boolean     DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itin_notes_itin ON itinerary_internal_notes(itinerary_id);
ALTER TABLE itinerary_internal_notes ENABLE ROW LEVEL SECURITY;

-- ─── Supplier links per itinerary item (Phase 6 / Supplier Picker) ──

CREATE TABLE IF NOT EXISTS itinerary_supplier_links (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id   text        NOT NULL,
  item_type      text        NOT NULL,            -- flight | hotel | transfer | tour | train | ferry | esim
  item_id        text        NOT NULL,            -- external_id from the item JSON blob
  supplier_id    text,                            -- FK to public.suppliers (cuid)
  supplier_name  text,
  reference      text,                            -- supplier booking reference / PNR
  confirmation   text,                            -- supplier confirmation number
  status         text        DEFAULT 'pending',   -- pending | requested | confirmed | cancelled
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itin_supplier_links_itin  ON itinerary_supplier_links(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itin_supplier_links_item  ON itinerary_supplier_links(itinerary_id, item_type, item_id);
ALTER TABLE itinerary_supplier_links ENABLE ROW LEVEL SECURITY;

-- ─── Audit events (Phase 15 / Security & Auditability) ───────────────

CREATE TABLE IF NOT EXISTS itinerary_audit_events (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id   text        NOT NULL,
  actor          text        NOT NULL,            -- staff email or 'client'
  event_type     text        NOT NULL,            -- e.g. status_changed | flight_added | sent_to_client | approved | version_saved
  old_value      jsonb,
  new_value      jsonb,
  ip_address     text,
  user_agent     text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itin_audit_itin  ON itinerary_audit_events(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itin_audit_actor ON itinerary_audit_events(actor);
CREATE INDEX IF NOT EXISTS idx_itin_audit_time  ON itinerary_audit_events(created_at DESC);
ALTER TABLE itinerary_audit_events ENABLE ROW LEVEL SECURITY;

-- ─── Package options per itinerary (Phase 11 / Pricing) ─────────────
-- Stored in Itinerary.options JSON for now, but this table supports
-- structured multi-option quotes (Essential / Signature / Luxury / VIP)

CREATE TABLE IF NOT EXISTS itinerary_package_options (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id   text        NOT NULL,
  name           text        NOT NULL,            -- Essential | Signature | Luxury | VIP | Bespoke
  description    text,
  price          numeric,
  currency       text        DEFAULT 'GBP',
  is_selected    boolean     DEFAULT false,
  features       text[]      DEFAULT '{}',
  sort_order     integer     DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itin_pkg_options_itin ON itinerary_package_options(itinerary_id);
ALTER TABLE itinerary_package_options ENABLE ROW LEVEL SECURITY;

-- ─── Payment schedule per itinerary (Phase 11 / Pricing) ────────────

CREATE TABLE IF NOT EXISTS itinerary_payment_schedule (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id   text        NOT NULL,
  label          text        NOT NULL,            -- Deposit | Balance | Final Payment
  amount         numeric     NOT NULL,
  currency       text        DEFAULT 'GBP',
  due_date       date,
  paid           boolean     DEFAULT false,
  paid_at        timestamptz,
  payment_ref    text,
  notes          text,
  sort_order     integer     DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itin_payment_schedule_itin ON itinerary_payment_schedule(itinerary_id);
ALTER TABLE itinerary_payment_schedule ENABLE ROW LEVEL SECURITY;

-- ─── Client comments / change requests (Phase 12 / Client Experience)

CREATE TABLE IF NOT EXISTS itinerary_client_comments (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id   text        NOT NULL,
  client_name    text,
  body           text        NOT NULL,
  item_ref       text,                            -- optional: references a specific item
  resolved       boolean     DEFAULT false,
  resolved_by    text,
  resolved_at    timestamptz,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itin_comments_itin ON itinerary_client_comments(itinerary_id);
ALTER TABLE itinerary_client_comments ENABLE ROW LEVEL SECURITY;

-- ─── Per-item margin view (corrected — per-item rows for the Margin tab)

CREATE OR REPLACE VIEW itinerary_margin_summary AS
SELECT itinerary_id, 'flight'   AS category, COALESCE(airline, flight_number, '') AS description, client_price, supplier_cost FROM itinerary_flights   WHERE client_price IS NOT NULL OR supplier_cost IS NOT NULL
UNION ALL
SELECT itinerary_id, 'hotel'    AS category, COALESCE(name, '')                    AS description, client_price, supplier_cost FROM itinerary_hotels    WHERE client_price IS NOT NULL OR supplier_cost IS NOT NULL
UNION ALL
SELECT itinerary_id, 'transfer' AS category, COALESCE(type, provider, '')           AS description, client_price, supplier_cost FROM itinerary_transfers WHERE client_price IS NOT NULL OR supplier_cost IS NOT NULL
UNION ALL
SELECT itinerary_id, 'tour'     AS category, COALESCE(name, provider, '')           AS description, client_price, supplier_cost FROM itinerary_tours     WHERE client_price IS NOT NULL OR supplier_cost IS NOT NULL
UNION ALL
SELECT itinerary_id, 'train'    AS category, COALESCE(train_number, provider, '')   AS description, client_price, supplier_cost FROM itinerary_trains    WHERE client_price IS NOT NULL OR supplier_cost IS NOT NULL
UNION ALL
SELECT itinerary_id, 'ferry'    AS category, COALESCE(operator, vessel, '')         AS description, client_price, supplier_cost FROM itinerary_ferries   WHERE client_price IS NOT NULL OR supplier_cost IS NOT NULL;
