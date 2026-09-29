-- ============================================================
-- JADE TRAVEL CLUB — RELEASE 2A: COMMERCIAL CONTROL & ENTITLEMENTS
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- `prisma db push` / `prisma migrate` — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is returned
-- for review only, per the standing implementation instruction. Nothing in
-- this migration has been executed by the implementing agent.
--
-- PREREQUISITE: prisma/migrations/jade_travel_club_v1.sql (Phase 1) must
-- already be applied — every table below has a foreign key back to
-- jade_club_memberships and/or jade_club_benefits.
--
-- SCOPE
--   creates 7 new tables: jade_club_commercial_policies,
--           jade_club_policy_benefits, jade_club_membership_terms,
--           jade_club_membership_benefit_snapshots,
--           jade_club_entitlement_slots, jade_club_entitlement_events,
--           jade_club_service_fee_discount_applications
--   adds    0 columns to any existing table (no walzCostUsd/customerValueUsd/
--           effectiveFrom/effectiveTo/termsUrl/internalNotes columns were
--           added to jade_club_benefits — Release 2A's implementation does
--           not use them; see the implementation report)
--   alters  0 existing tables, drops 0 columns/tables/indexes
--   touches 0 existing rows anywhere. ZERO seed rows are created in ANY
--           new table — no policy, no benefit grant, no terms, no slot, no
--           event, no discount application. Every commercial number
--           (price, discount %, benefit counts) must be authored by an
--           admin through the /admin/jade-club UI after this migration
--           runs.
--
-- WHY THESE TABLES TRAVEL TOGETHER
--   One feature (Release 2A: versioned commercial policy -> policy-benefit
--   grants -> per-member immutable terms snapshot -> per-benefit snapshot
--   -> pre-issued entitlement slots -> append-only event log, plus a
--   built-but-unwired service-fee-discount audit table). Every table below
--   has a required FK into the one above it in that chain and is useless
--   without it.
--
-- RELATIONSHIP TO EXISTING SYSTEMS (do not confuse the two)
--   This migration does not touch WalzRewardsMembership or
--   WalzMilesTransaction at all. It does not touch jade_club_memberships,
--   jade_physical_cards, or jade_club_benefits beyond a plain, read-only FK
--   reference (jade_club_membership_terms.membership_id ->
--   jade_club_memberships.id). Jade Club commercial policy (this
--   migration) is a SEPARATE concept from Walz Miles/loyalty status.
--
-- THE SINGLE-ACTIVE-POLICY INVARIANT
--   Only one ACTIVE policy may exist per (tier, market, currency) at a
--   time. This is enforced with a PARTIAL UNIQUE INDEX — the standard
--   Postgres mechanism for "at most one row matching X per some
--   condition" — rather than only an application-level check:
--     CREATE UNIQUE INDEX ... ON jade_club_commercial_policies
--       (tier, market, currency) WHERE status = 'ACTIVE'
--   This is fully expressible in this repo's hand-written-SQL convention
--   (partial indexes are ordinary Postgres, no extension required) — see
--   idx_jade_club_commercial_policies_one_active below.
--
-- CONVENTION: snake_case tables/columns + TEXT/CHECK for status-like
--   fields, matching prisma/migrations/jade_travel_club_v1.sql (Phase 1)
--   and this repo's established convention for every recent hand-run
--   migration — widening a CHECK is a trivial idempotent ALTER, unlike
--   ALTER TYPE. Valid values are additionally enforced in TypeScript via
--   lib/jade-club/commercial-types.ts.
--
-- ROLLBACK (reverse order — children before parents)
--   DROP TABLE IF EXISTS jade_club_service_fee_discount_applications;
--   DROP TABLE IF EXISTS jade_club_entitlement_events;
--   DROP TABLE IF EXISTS jade_club_entitlement_slots;
--   DROP TABLE IF EXISTS jade_club_membership_benefit_snapshots;
--   DROP TABLE IF EXISTS jade_club_membership_terms;
--   DROP TABLE IF EXISTS jade_club_policy_benefits;
--   DROP TABLE IF EXISTS jade_club_commercial_policies;
--   (Safe: nothing outside this feature references these tables. No
--   existing table/column is touched by this migration.)
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. jade_club_commercial_policies — versioned policy envelope
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jade_club_commercial_policies (
  id                            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tier                          text        NOT NULL,
  market                        text        NOT NULL,
  currency                      text        NOT NULL,
  annual_price_minor            integer     NOT NULL,
  duration_months               integer     NOT NULL DEFAULT 12,
  service_fee_discount_percent  integer     NOT NULL,
  effective_from                timestamptz NOT NULL,
  effective_to                  timestamptz,
  version                       integer     NOT NULL,
  status                        text        NOT NULL DEFAULT 'DRAFT',
  created_by                    text        NOT NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_commercial_policies_tier') THEN
    ALTER TABLE jade_club_commercial_policies
      ADD CONSTRAINT chk_jade_commercial_policies_tier CHECK (tier IN ('CLUB','CLUB_PLUS'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_commercial_policies_status') THEN
    ALTER TABLE jade_club_commercial_policies
      ADD CONSTRAINT chk_jade_commercial_policies_status CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_commercial_policies_price_nonneg') THEN
    ALTER TABLE jade_club_commercial_policies
      ADD CONSTRAINT chk_jade_commercial_policies_price_nonneg CHECK (annual_price_minor >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_commercial_policies_discount_range') THEN
    ALTER TABLE jade_club_commercial_policies
      ADD CONSTRAINT chk_jade_commercial_policies_discount_range CHECK (service_fee_discount_percent BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_commercial_policies_duration_positive') THEN
    ALTER TABLE jade_club_commercial_policies
      ADD CONSTRAINT chk_jade_commercial_policies_duration_positive CHECK (duration_months > 0);
  END IF;
END $$;

-- One version number per (tier, market, currency) scope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_jade_commercial_policies_scope_version
  ON jade_club_commercial_policies (tier, market, currency, version);

-- THE single-active-policy invariant — a partial unique index, the
-- standard Postgres mechanism for "at most one row matching X per some
-- condition". This is the DB-level backstop; activatePolicy() in
-- lib/jade-club/commercial-policy.ts additionally supersedes the prior
-- ACTIVE row in the same transaction as activating the new one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jade_club_commercial_policies_one_active
  ON jade_club_commercial_policies (tier, market, currency) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_jade_commercial_policies_status ON jade_club_commercial_policies (status);

ALTER TABLE jade_club_commercial_policies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_club_commercial_policies" ON jade_club_commercial_policies
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. jade_club_policy_benefits — generic typed benefit-grant rows
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jade_club_policy_benefits (
  id                  text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_id           text        NOT NULL REFERENCES jade_club_commercial_policies(id) ON DELETE CASCADE,
  benefit_key         text        NOT NULL,
  entitlement_type    text        NOT NULL,
  count_per_period    integer,
  cost_cap_minor_usd  integer,
  boolean_eligible    boolean,
  created_at          timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_policy_benefits_type') THEN
    ALTER TABLE jade_club_policy_benefits
      ADD CONSTRAINT chk_jade_policy_benefits_type
      CHECK (entitlement_type IN ('COUNT_PER_PERIOD','COST_CAPPED','BOOLEAN_ELIGIBILITY'));
  END IF;
  -- Exactly one of the three typed value columns is set, matching entitlement_type.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_policy_benefits_shape') THEN
    ALTER TABLE jade_club_policy_benefits
      ADD CONSTRAINT chk_jade_policy_benefits_shape CHECK (
        (entitlement_type = 'COUNT_PER_PERIOD' AND count_per_period IS NOT NULL AND count_per_period > 0 AND cost_cap_minor_usd IS NULL AND boolean_eligible IS NULL)
        OR (entitlement_type = 'COST_CAPPED' AND cost_cap_minor_usd IS NOT NULL AND cost_cap_minor_usd >= 0 AND count_per_period IS NULL AND boolean_eligible IS NULL)
        OR (entitlement_type = 'BOOLEAN_ELIGIBILITY' AND boolean_eligible IS NOT NULL AND count_per_period IS NULL AND cost_cap_minor_usd IS NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_jade_policy_benefits_policy_key ON jade_club_policy_benefits (policy_id, benefit_key);

ALTER TABLE jade_club_policy_benefits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_club_policy_benefits" ON jade_club_policy_benefits
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. jade_club_membership_terms — immutable per-member contract snapshot
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jade_club_membership_terms (
  id                            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  membership_id                 text        NOT NULL REFERENCES jade_club_memberships(id) ON DELETE CASCADE,
  policy_id                     text        NOT NULL REFERENCES jade_club_commercial_policies(id) ON DELETE RESTRICT, -- traceability ONLY — never read for a calculation
  policy_version                integer     NOT NULL,
  tier                          text        NOT NULL,
  market                        text        NOT NULL,
  currency                      text        NOT NULL,
  annual_price_minor            integer     NOT NULL,
  duration_months               integer     NOT NULL,
  service_fee_discount_percent  integer     NOT NULL,
  activated_at                  timestamptz NOT NULL,
  expires_at                    timestamptz NOT NULL,
  source                        text        NOT NULL,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_membership_terms_source') THEN
    ALTER TABLE jade_club_membership_terms
      ADD CONSTRAINT chk_jade_membership_terms_source CHECK (source IN ('DEFAULT','ADMIN_GRANT','PROMOTION','PURCHASE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jade_membership_terms_membership ON jade_club_membership_terms (membership_id);
CREATE INDEX IF NOT EXISTS idx_jade_membership_terms_expires    ON jade_club_membership_terms (expires_at);

ALTER TABLE jade_club_membership_terms ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_club_membership_terms" ON jade_club_membership_terms
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. jade_club_membership_benefit_snapshots — immutable per-benefit copy
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jade_club_membership_benefit_snapshots (
  id                   text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  membership_terms_id  text        NOT NULL REFERENCES jade_club_membership_terms(id) ON DELETE CASCADE,
  benefit_key          text        NOT NULL,  -- plain copy, NOT a live FK to jade_club_benefits
  benefit_name         text        NOT NULL,  -- copied from jade_club_benefits.name at activation time
  entitlement_type     text        NOT NULL,
  count_per_period     integer,
  cost_cap_minor_usd   integer,
  boolean_eligible     boolean,
  created_at           timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_benefit_snapshots_type') THEN
    ALTER TABLE jade_club_membership_benefit_snapshots
      ADD CONSTRAINT chk_jade_benefit_snapshots_type
      CHECK (entitlement_type IN ('COUNT_PER_PERIOD','COST_CAPPED','BOOLEAN_ELIGIBILITY'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_jade_benefit_snapshots_terms_key ON jade_club_membership_benefit_snapshots (membership_terms_id, benefit_key);

ALTER TABLE jade_club_membership_benefit_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_club_membership_benefit_snapshots" ON jade_club_membership_benefit_snapshots
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. jade_club_entitlement_slots — pre-issued mutable entitlement inventory
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jade_club_entitlement_slots (
  id                         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  membership_terms_id        text        NOT NULL REFERENCES jade_club_membership_terms(id) ON DELETE CASCADE,
  benefit_snapshot_id        text        NOT NULL REFERENCES jade_club_membership_benefit_snapshots(id) ON DELETE CASCADE,
  period_key                 text        NOT NULL,
  slot_number                integer     NOT NULL,
  status                     text        NOT NULL DEFAULT 'AVAILABLE',
  reserved_at                timestamptz,
  reserved_by                text,
  reservation_expires_at     timestamptz,
  consumed_at                timestamptz,
  linked_provider_reference  text,  -- generic, nullable — unused in 2A, no provider is ever called from this feature
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_entitlement_slots_status') THEN
    ALTER TABLE jade_club_entitlement_slots
      ADD CONSTRAINT chk_jade_entitlement_slots_status CHECK (status IN ('AVAILABLE','RESERVED','CONSUMED','REVERSED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_entitlement_slots_number_positive') THEN
    ALTER TABLE jade_club_entitlement_slots
      ADD CONSTRAINT chk_jade_entitlement_slots_number_positive CHECK (slot_number > 0);
  END IF;
END $$;

-- THE constraint that makes phantom entitlement creation structurally
-- impossible — reservation/consumption only ever CAS-transitions an
-- already-issued row, never inserts one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_jade_entitlement_slots_identity
  ON jade_club_entitlement_slots (membership_terms_id, benefit_snapshot_id, period_key, slot_number);

CREATE INDEX IF NOT EXISTS idx_jade_entitlement_slots_scope_status
  ON jade_club_entitlement_slots (membership_terms_id, benefit_snapshot_id, period_key, status);
CREATE INDEX IF NOT EXISTS idx_jade_entitlement_slots_reservation_expiry
  ON jade_club_entitlement_slots (status, reservation_expires_at);

ALTER TABLE jade_club_entitlement_slots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_club_entitlement_slots" ON jade_club_entitlement_slots
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. jade_club_entitlement_events — TRUE append-only audit trail
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jade_club_entitlement_events (
  id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slot_id         text        NOT NULL REFERENCES jade_club_entitlement_slots(id) ON DELETE CASCADE,
  event_type      text        NOT NULL,
  actor_user_id   text,
  actor_staff_id  text,
  detail          text,
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_entitlement_events_type') THEN
    ALTER TABLE jade_club_entitlement_events
      ADD CONSTRAINT chk_jade_entitlement_events_type
      CHECK (event_type IN ('ISSUED','RESERVED','RESERVATION_RELEASED','CONSUMED','REVERSED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jade_entitlement_events_slot ON jade_club_entitlement_events (slot_id);
CREATE INDEX IF NOT EXISTS idx_jade_entitlement_events_type ON jade_club_entitlement_events (event_type);

ALTER TABLE jade_club_entitlement_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_club_entitlement_events" ON jade_club_entitlement_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- No UPDATE/DELETE policy is granted to any role beyond service_role's own
-- blanket ALL policy above (matching every other table in this migration
-- and in jade_travel_club_v1.sql) — true INSERT-only enforcement for
-- non-service-role callers is out of scope for this hand-written-SQL
-- convention; append-only-ness is enforced at the application layer (no
-- route in this feature ever calls .update()/.delete() on this table).

-- ────────────────────────────────────────────────────────────
-- 7. jade_club_service_fee_discount_applications — audit structure, ZERO
--    live wiring (see lib/jade-club/service-fee-discount.ts)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jade_club_service_fee_discount_applications (
  id                       text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  membership_terms_id      text        NOT NULL REFERENCES jade_club_membership_terms(id) ON DELETE RESTRICT,
  entity_type              text        NOT NULL,
  entity_id                text        NOT NULL,
  base_service_fee_minor   integer     NOT NULL,
  discount_percent         integer     NOT NULL,
  discount_amount_minor    integer     NOT NULL,
  final_service_fee_minor  integer     NOT NULL,
  applied_at               timestamptz NOT NULL DEFAULT now(),
  applied_by               text        NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_fee_discount_apps_nonneg') THEN
    ALTER TABLE jade_club_service_fee_discount_applications
      ADD CONSTRAINT chk_jade_fee_discount_apps_nonneg
      CHECK (base_service_fee_minor >= 0 AND discount_amount_minor >= 0 AND final_service_fee_minor >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_fee_discount_apps_percent_range') THEN
    ALTER TABLE jade_club_service_fee_discount_applications
      ADD CONSTRAINT chk_jade_fee_discount_apps_percent_range CHECK (discount_percent BETWEEN 0 AND 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jade_fee_discount_apps_terms  ON jade_club_service_fee_discount_applications (membership_terms_id);
CREATE INDEX IF NOT EXISTS idx_jade_fee_discount_apps_entity ON jade_club_service_fee_discount_applications (entity_type, entity_id);

ALTER TABLE jade_club_service_fee_discount_applications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_club_service_fee_discount_applications" ON jade_club_service_fee_discount_applications
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDATION — run after the migration
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_club_commercial_policies')                 AS policies_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_club_policy_benefits')                     AS policy_benefits_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_club_membership_terms')                    AS terms_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_club_membership_benefit_snapshots')        AS snapshots_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_club_entitlement_slots')                   AS slots_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_club_entitlement_events')                  AS events_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_club_service_fee_discount_applications')   AS discount_apps_table_exists,
  (SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_jade_club_commercial_policies_one_active')                  AS one_active_partial_index_exists,
  (SELECT count(*) FROM jade_club_commercial_policies)                                                                AS policy_row_count,                -- Expect: 0 (no seed data)
  (SELECT count(*) FROM jade_club_policy_benefits)                                                                    AS policy_benefit_row_count,         -- Expect: 0
  (SELECT count(*) FROM jade_club_membership_terms)                                                                   AS terms_row_count,                  -- Expect: 0
  (SELECT count(*) FROM jade_club_membership_benefit_snapshots)                                                       AS snapshot_row_count,                -- Expect: 0
  (SELECT count(*) FROM jade_club_entitlement_slots)                                                                  AS slot_row_count,                   -- Expect: 0
  (SELECT count(*) FROM jade_club_entitlement_events)                                                                 AS event_row_count,                  -- Expect: 0
  (SELECT count(*) FROM jade_club_service_fee_discount_applications)                                                  AS discount_application_row_count;   -- Expect: 0
-- Expect: all seven *_table_exists = 1, one_active_partial_index_exists = 1,
-- every row_count = 0 (this migration seeds nothing).
