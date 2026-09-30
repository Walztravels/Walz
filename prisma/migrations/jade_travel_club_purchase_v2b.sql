-- ============================================================
-- JADE TRAVEL CLUB — RELEASE 2B: PAID MEMBERSHIP PURCHASE & LIFECYCLE
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- `prisma db push` / `prisma migrate` — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is returned
-- for review only, per the standing implementation instruction. Nothing in
-- this migration has been executed by the implementing agent.
--
-- PREREQUISITES:
--   prisma/migrations/jade_travel_club_v1.sql            (Phase 1)
--   prisma/migrations/jade_travel_club_commercial_v2a.sql (Release 2A)
-- must already be applied — jade_club_purchases has foreign keys into
-- jade_club_memberships, jade_club_commercial_policies, and
-- jade_club_membership_terms.
--
-- SCOPE
--   creates 1 new table: jade_club_purchases
--   adds    0 columns to any existing table
--   alters  0 existing tables, drops 0 columns/tables/indexes
--   touches 0 existing rows anywhere. ZERO seed rows are created.
--
-- WHAT THIS TABLE IS
--   The customer-facing paid-checkout ledger. One row per checkout attempt.
--   Two independent state machines on one row (see
--   docs/jade-2b-purchase-state-machine.md for the full design):
--     payment_status:    PENDING -> SUCCEEDED | FAILED | CANCELLED ; SUCCEEDED -> REFUNDED
--     activation_status: NOT_STARTED -> PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING -> ACTIVATED | FAILED_PERMANENTLY | PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION
--   amount_minor/currency/policy_id/policy_version are copied from the
--   resolved ACTIVE jade_club_commercial_policies row at CHECKOUT-CREATION
--   time and never mutated again by any route.
--
-- RELATIONSHIP TO EXISTING SYSTEMS (do not confuse the two)
--   This migration does not touch WalzRewardsMembership or
--   WalzMilesTransaction. It does not alter jade_club_memberships,
--   jade_club_commercial_policies, or jade_club_membership_terms beyond
--   plain, read-only FK references. activateMembershipTerms() (Release 2A,
--   untouched) remains the ONLY function that ever creates a
--   jade_club_membership_terms row — this migration's table only ever
--   POINTS AT one, via membership_terms_id, once activation succeeds.
--
-- DUPLICATE/CONCURRENT WEBHOOK DELIVERY — THE STRUCTURAL GUARD
--   @@unique(provider, provider_reference) below is the DB-level backstop
--   that makes two Stripe Checkout Sessions ever colliding on the same
--   provider reference structurally impossible to double-insert. The
--   application layer's CAS updates (updateMany keyed on current status +
--   count check) are the primary mechanism for duplicate/concurrent
--   webhook safety — see lib/jade-club/purchase.ts and
--   app/api/webhooks/jade-club/route.ts.
--
-- CONVENTION: snake_case tables/columns + TEXT/CHECK for status-like
--   fields, matching every other Jade Club migration in this repo —
--   widening a CHECK is a trivial idempotent ALTER, unlike ALTER TYPE.
--   Valid values are additionally enforced in TypeScript via
--   lib/jade-club/purchase-types.ts.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS jade_club_purchases;
--   (Safe: nothing outside this feature references this table. No existing
--   table/column is touched by this migration.)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS jade_club_purchases (
  id                    text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id               text        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  membership_id         text        REFERENCES jade_club_memberships(id) ON DELETE SET NULL,
  policy_id             text        NOT NULL REFERENCES jade_club_commercial_policies(id) ON DELETE RESTRICT,
  policy_version        integer     NOT NULL,
  tier                  text        NOT NULL,
  market                text        NOT NULL,
  currency              text        NOT NULL,
  amount_minor          integer     NOT NULL,
  provider              text        NOT NULL DEFAULT 'STRIPE',
  provider_reference    text        NOT NULL,
  payment_status        text        NOT NULL DEFAULT 'PENDING',
  activation_status     text        NOT NULL DEFAULT 'NOT_STARTED',
  activation_attempts   integer     NOT NULL DEFAULT 0,
  membership_terms_id   text        REFERENCES jade_club_membership_terms(id) ON DELETE SET NULL,
  failure_reason        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  paid_at               timestamptz,
  activated_at          timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_purchases_tier') THEN
    ALTER TABLE jade_club_purchases
      ADD CONSTRAINT chk_jade_purchases_tier CHECK (tier IN ('CLUB','CLUB_PLUS'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_purchases_payment_status') THEN
    ALTER TABLE jade_club_purchases
      ADD CONSTRAINT chk_jade_purchases_payment_status
      CHECK (payment_status IN ('PENDING','SUCCEEDED','FAILED','CANCELLED','REFUNDED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_purchases_activation_status') THEN
    ALTER TABLE jade_club_purchases
      ADD CONSTRAINT chk_jade_purchases_activation_status
      CHECK (activation_status IN ('NOT_STARTED','PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING','ACTIVATED','FAILED_PERMANENTLY','PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_purchases_provider') THEN
    ALTER TABLE jade_club_purchases
      ADD CONSTRAINT chk_jade_purchases_provider CHECK (provider IN ('STRIPE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_purchases_amount_nonneg') THEN
    ALTER TABLE jade_club_purchases
      ADD CONSTRAINT chk_jade_purchases_amount_nonneg CHECK (amount_minor >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_jade_purchases_attempts_nonneg') THEN
    ALTER TABLE jade_club_purchases
      ADD CONSTRAINT chk_jade_purchases_attempts_nonneg CHECK (activation_attempts >= 0);
  END IF;
END $$;

-- THE structural duplicate-checkout-session guard.
CREATE UNIQUE INDEX IF NOT EXISTS uq_jade_purchases_provider_reference
  ON jade_club_purchases (provider, provider_reference);

CREATE INDEX IF NOT EXISTS idx_jade_purchases_user             ON jade_club_purchases (user_id);
CREATE INDEX IF NOT EXISTS idx_jade_purchases_payment_status   ON jade_club_purchases (payment_status);
CREATE INDEX IF NOT EXISTS idx_jade_purchases_activation_status ON jade_club_purchases (activation_status);

ALTER TABLE jade_club_purchases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_jade_club_purchases" ON jade_club_purchases
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDATION — run after the migration
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'jade_club_purchases')      AS purchases_table_exists,
  (SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_jade_purchases_provider_reference')      AS provider_reference_unique_index_exists,
  (SELECT count(*) FROM jade_club_purchases)                                                      AS purchase_row_count;         -- Expect: 0
-- Expect: purchases_table_exists = 1, provider_reference_unique_index_exists = 1, purchase_row_count = 0.
