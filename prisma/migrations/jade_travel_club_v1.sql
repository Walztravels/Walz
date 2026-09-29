-- ============================================================
-- JADE TRAVEL CLUB — PHASE 1 (idempotent, hand-run in the Supabase SQL
-- Editor). NEVER via `prisma db push` / `prisma migrate` — after running,
-- only `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is returned
-- for review only, per the standing implementation instruction. Nothing in
-- this migration has been executed by the implementing agent.
--
-- SCOPE
--   creates 3 new tables: jade_club_memberships, jade_physical_cards,
--           jade_club_benefits
--   adds    0 columns to any existing table
--   alters  0 existing tables, drops 0 columns/tables/indexes
--   touches 0 existing rows anywhere — no backfill of any kind. No row is
--           created here for any existing user; membership rows are created
--           lazily by the application (lib/jade-club/membership.ts) the
--           first time a customer visits Jade Club / their Digital Card —
--           this migration seeds ONLY the benefits catalog (static
--           reference data, not customer/PII data).
--
-- WHY THESE TABLES TRAVEL TOGETHER
--   One feature (Jade Travel Club membership + Digital Jade Card + benefits
--   architecture + physical-card foundation). jade_physical_cards has a
--   required FK to jade_club_memberships and is useless without it.
--
-- RELATIONSHIP TO EXISTING SYSTEMS (do not confuse the two)
--   Jade Club membership (this migration) = a purchased-or-granted
--   programme tier (FREE / CLUB / CLUB_PLUS).
--   Walz Miles / loyalty status tier ("WalzRewardsMembership".tier —
--   bronze/silver/gold/platinum) = a SEPARATE, pre-existing, earned-status
--   concept. This migration does not read, write, or reference
--   "WalzRewardsMembership" or "WalzMilesTransaction" at the database
--   level at all — the application reads Miles read-only, in code, for
--   display purposes only.
--
-- CONVENTION: snake_case tables/columns + TEXT/CHECK for status-like
--   fields, matching this repo's established convention for recent
--   hand-run migrations (Team Hub V1, Quote.status) — see
--   prisma/migrations/team_hub_v1_core.sql for the precedent. Valid values
--   are enforced in TypeScript (lib/jade-club/types.ts) in addition to the
--   DB CHECK constraints below.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS jade_physical_cards;
--   DROP TABLE IF EXISTS jade_club_memberships;
--   DROP TABLE IF EXISTS jade_club_benefits;
--   (Safe: nothing else references these tables. No existing table/column
--   is touched by this migration, so there is nothing else to reverse.)
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. jade_club_memberships — one row per member (lazily created)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jade_club_memberships (
  id                text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id           text        NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  member_code       text        NOT NULL UNIQUE,
  tier              text        NOT NULL DEFAULT 'FREE',
  status            text        NOT NULL DEFAULT 'FREE',
  source            text        NOT NULL DEFAULT 'DEFAULT',
  started_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  cancelled_at      timestamptz,
  qr_token_version  integer     NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_club_memberships_tier') THEN
    ALTER TABLE jade_club_memberships
      ADD CONSTRAINT chk_jade_club_memberships_tier CHECK (tier IN ('FREE','CLUB','CLUB_PLUS'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_club_memberships_status') THEN
    ALTER TABLE jade_club_memberships
      ADD CONSTRAINT chk_jade_club_memberships_status
      CHECK (status IN ('FREE','ACTIVE','EXPIRING','EXPIRED','CANCELLED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_club_memberships_source') THEN
    ALTER TABLE jade_club_memberships
      ADD CONSTRAINT chk_jade_club_memberships_source
      CHECK (source IN ('DEFAULT','ADMIN_GRANT','PROMOTION','PURCHASE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jade_club_memberships_tier   ON jade_club_memberships (tier);
CREATE INDEX IF NOT EXISTS idx_jade_club_memberships_status ON jade_club_memberships (status);

ALTER TABLE jade_club_memberships ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_club_memberships" ON jade_club_memberships
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. jade_physical_cards — fulfilment foundation only (no order flow live)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jade_physical_cards (
  id                  text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  membership_id       text        NOT NULL UNIQUE REFERENCES jade_club_memberships(id) ON DELETE CASCADE,
  status              text        NOT NULL DEFAULT 'NOT_ORDERED',
  cardholder_name     text,
  shipping_address1   text,
  shipping_address2   text,
  shipping_city       text,
  shipping_state      text,
  shipping_postal     text,
  shipping_country    text,
  tracking_reference  text,
  requested_at        timestamptz,
  approved_at         timestamptz,
  shipped_at          timestamptz,
  delivered_at        timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_physical_cards_status') THEN
    ALTER TABLE jade_physical_cards
      ADD CONSTRAINT chk_jade_physical_cards_status
      CHECK (status IN ('NOT_ORDERED','REQUESTED','APPROVED','PRINTING','SHIPPED','DELIVERED','CANCELLED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jade_physical_cards_status ON jade_physical_cards (status);

ALTER TABLE jade_physical_cards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_physical_cards" ON jade_physical_cards
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. jade_club_benefits — reusable Walz + Partner benefits catalog
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jade_club_benefits (
  id                    text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key                   text        NOT NULL UNIQUE,
  name                  text        NOT NULL,
  category              text        NOT NULL,
  provider              text,
  description           text,
  eligible_tiers        text[]      NOT NULL DEFAULT '{}',
  status                text        NOT NULL DEFAULT 'COMING_SOON',
  activation_method     text,
  activation_url        text,
  country_restrictions  text[]      NOT NULL DEFAULT '{}',
  sort_order            integer     NOT NULL DEFAULT 0,
  active                boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_club_benefits_category') THEN
    ALTER TABLE jade_club_benefits
      ADD CONSTRAINT chk_jade_club_benefits_category CHECK (category IN ('WALZ','PARTNER'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_club_benefits_status') THEN
    ALTER TABLE jade_club_benefits
      ADD CONSTRAINT chk_jade_club_benefits_status CHECK (status IN ('ACTIVE','INACTIVE','COMING_SOON'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_club_benefits_activation_method') THEN
    ALTER TABLE jade_club_benefits
      ADD CONSTRAINT chk_jade_club_benefits_activation_method
      CHECK (activation_method IS NULL OR activation_method IN ('EXTERNAL_LINK','CODE','API','MANUAL','NONE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jade_club_benefits_category ON jade_club_benefits (category);
CREATE INDEX IF NOT EXISTS idx_jade_club_benefits_status   ON jade_club_benefits (status);

ALTER TABLE jade_club_benefits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_club_benefits" ON jade_club_benefits
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. Seed the benefits catalog (static reference data — no PII, no
--    customer data, no financial figures). Every partner benefit ships
--    COMING_SOON / INACTIVE — nothing is claimed as "included" and no
--    activation happens automatically. Safe to re-run: ON CONFLICT DO
--    NOTHING keeps any admin edits already made intact.
-- ────────────────────────────────────────────────────────────
INSERT INTO jade_club_benefits (key, name, category, provider, description, eligible_tiers, status, activation_method, sort_order)
VALUES
  ('jade-ai',        'Jade AI Travel Assistant', 'WALZ',    'Walz Travels', 'Plan, book, and manage your trips with Jade, your AI travel assistant.', ARRAY['FREE','CLUB','CLUB_PLUS'], 'ACTIVE',      'NONE', 10),
  ('walz-miles',     'Walz Miles',               'WALZ',    'Walz Travels', 'Earn Walz Miles on eligible Walz bookings.',                              ARRAY['FREE','CLUB','CLUB_PLUS'], 'ACTIVE',      'NONE', 20),
  ('jade-connect',   'Jade Connect / eSIM',      'WALZ',    'Walz Travels', 'Stay connected abroad with Jade Connect eSIM plans.',                     ARRAY['FREE','CLUB','CLUB_PLUS'], 'ACTIVE',      'NONE', 30),
  ('visa-services',  'Visa Services',            'WALZ',    'Walz Travels', 'End-to-end visa application support.',                                    ARRAY['FREE','CLUB','CLUB_PLUS'], 'ACTIVE',      'NONE', 40),
  ('concierge',      'Concierge',                'WALZ',    'Walz Travels', 'Personal travel concierge for bookings and requests.',                    ARRAY['CLUB','CLUB_PLUS'],        'COMING_SOON', NULL,   50),
  ('member-offers',  'Member Offers',            'WALZ',    'Walz Travels', 'Exclusive offers for Jade Club members.',                                 ARRAY['CLUB','CLUB_PLUS'],        'COMING_SOON', NULL,   60),
  ('priority-pass',  'Airport Lounge Access',    'PARTNER', 'Priority Pass', 'Airport lounge benefits for Jade Club+ members.',                        ARRAY['CLUB_PLUS'],               'COMING_SOON', NULL,   70)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDATION — run after the migration
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_club_memberships') AS memberships_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_physical_cards')    AS physical_cards_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_club_benefits')     AS benefits_table_exists,
  (SELECT count(*) FROM jade_club_memberships)  AS membership_row_count,   -- Expect: 0 (no backfill)
  (SELECT count(*) FROM jade_physical_cards)    AS physical_card_row_count, -- Expect: 0 (no backfill)
  (SELECT count(*) FROM jade_club_benefits)     AS benefit_row_count;       -- Expect: 7 (seed rows above)
-- Expect: all three *_table_exists = 1, membership_row_count = 0,
-- physical_card_row_count = 0, benefit_row_count = 7.
