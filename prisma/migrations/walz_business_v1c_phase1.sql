-- ============================================================
-- WALZ BUSINESS — V1-C PHASE 1: recipient-facing visa-link tokens
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- `prisma db push` / `prisma migrate` — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is returned
-- for review only, per the standing implementation instruction. Nothing in
-- this migration has been executed by the implementing agent. It has NOT
-- been run against any disposable/local Postgres either (none was available
-- in this sandbox — see the implementation report for what was verified
-- instead: syntax-by-inspection and structural parity with the already-run
-- walz_business_r2_1.sql).
--
-- PREREQUISITE: prisma/migrations/walz_business_r1_foundation.sql,
-- prisma/migrations/walz_business_r2.sql, and
-- prisma/migrations/walz_business_r2_1.sql have already been run.
--
-- SCOPE
--   creates 1 new table:
--             business_service_link_tokens
--   alters  0 existing tables, drops 0 columns/tables/indexes, backfills
--           0 rows (brand-new table — nothing pre-existing to backfill).
--
-- WHY THIS TABLE EXISTS
--   V1-C Phase 1 lets a TRAVEL_MANAGER+ org member issue a short-lived,
--   single-use link addressed to one BusinessTraveller (who has no User
--   account and no OrganizationMembership) so that traveller can later
--   (a LATER phase, not built here) submit visa documents for one specific
--   TravelRequestService without ever being granted VISA_DOCUMENTS_VIEW,
--   without a User row ever being created for them, and without an
--   OrganizationMembership ever being created for them.
--
-- TOKEN SECURITY — same discipline as organization_invitations
--   Only token_hash (sha256 hex of a crypto.randomBytes(32) raw token) is
--   ever stored — never the raw token. The raw token exists only
--   transiently, in the HTTP response body of the issuance call, to let the
--   issuer build the recipient URL; it is never logged and never persisted
--   anywhere else.
--
-- EXACTLY ONE LIVE TOKEN PER SERVICE — DB-ENFORCED, not just
-- application-level
--   uq_bslt_live_per_service is a PARTIAL unique index on
--   travel_request_service_id WHERE consumed_at IS NULL AND revoked_at IS
--   NULL. At most one row per service can ever be "live" (unconsumed,
--   unrevoked) at a time, even under a race between two concurrent issuance
--   requests — the loser gets a unique-constraint violation, never a second
--   live row. Application code (lib/business/service-link-token.ts) revokes/
--   replaces any prior live token in the SAME operation before inserting the
--   new one, so this index should never actually be hit in the normal path;
--   it exists as the DB-level backstop in case application code is ever
--   bypassed or buggy.
--
-- CHECK CONSTRAINT
--   chk_bslt_issuer requires at least one of issued_by_staff_id /
--   issued_by_membership_id to be set — identical pattern to
--   chk_org_invitations_issuer in walz_business_r2_1.sql.
--
-- CONVENTION: snake_case table/columns + TEXT for status-like / identifier
--   fields (matching walz_business_r1_foundation.sql / walz_business_r2.sql /
--   walz_business_r2_1.sql) for this new table. RLS enabled with one
--   service_role-only policy, identical to every other Walz Business table —
--   this is NOT row-level tenant isolation at the DB layer; tenant isolation
--   is 100% application-code (lib/business/authz.ts,
--   lib/business/org-type-gate.ts, lib/business/service-link-token.ts).
--
-- DELIBERATELY NOT BUILT HERE (see mission scope — V1-C Phase 1)
--   - No recipient-facing GET/view route and no recipient-facing
--     submit/upload POST route — those are a later phase. This migration
--     only creates the storage the later phase's routes will read/write via
--     the SAME table (no further migration will be needed for that phase).
--   - No anonymous/unauthenticated caller of any kind exists yet.
--   - No change to any existing table, column, or index.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS business_service_link_tokens;
--   (Safe: nothing outside V1-C Phase 1 code reads this table. After
--   rollback, the issuance/reissue/revoke routes added in this phase become
--   unreachable at the Prisma-client level and must be redeployed only
--   alongside a re-run of this migration.)
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- business_service_link_tokens
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_service_link_tokens (
  id                          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id             text        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_traveller_id       text        NOT NULL REFERENCES business_travellers(id) ON DELETE CASCADE,
  travel_request_id           text        NOT NULL REFERENCES travel_requests(id) ON DELETE CASCADE,
  travel_request_service_id   text        NOT NULL REFERENCES travel_request_services(id) ON DELETE CASCADE,
  token_hash                  text        NOT NULL,
  issued_by_membership_id     text REFERENCES organization_memberships(id) ON DELETE SET NULL,
  issued_by_staff_id          text,
  expires_at                  timestamptz NOT NULL,
  revoked_at                  timestamptz,
  revoked_by_membership_id    text REFERENCES organization_memberships(id) ON DELETE SET NULL,
  consumed_at                 timestamptz,
  consumed_ip_address         text,
  consumed_user_agent         text,
  replaces_token_id           text REFERENCES business_service_link_tokens(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bslt_issuer') THEN
    ALTER TABLE business_service_link_tokens ADD CONSTRAINT chk_bslt_issuer
      CHECK (issued_by_staff_id IS NOT NULL OR issued_by_membership_id IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bslt_token_hash ON business_service_link_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_bslt_org ON business_service_link_tokens (organization_id);
CREATE INDEX IF NOT EXISTS idx_bslt_traveller ON business_service_link_tokens (business_traveller_id);
CREATE INDEX IF NOT EXISTS idx_bslt_service ON business_service_link_tokens (travel_request_service_id);
CREATE INDEX IF NOT EXISTS idx_bslt_expires ON business_service_link_tokens (expires_at);
-- At most one LIVE (unconsumed, unrevoked) token per service at a time —
-- see the "EXACTLY ONE LIVE TOKEN PER SERVICE" note above.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bslt_live_per_service ON business_service_link_tokens (travel_request_service_id) WHERE consumed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE business_service_link_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE business_service_link_tokens FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_business_service_link_tokens" ON business_service_link_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDATION — run after the migration
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'business_service_link_tokens')                                       AS table_exists,
  (SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_bslt_token_hash')                                                                  AS token_hash_unique_index_exists,
  (SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_bslt_live_per_service')                                                            AS live_per_service_partial_index_exists,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'chk_bslt_issuer')                                                                    AS issuer_check_constraint_exists,
  (SELECT count(*) FROM business_service_link_tokens)                                                                                       AS row_count; -- Expect: 0 (brand new table)
-- Expect: table_exists = 1, token_hash_unique_index_exists = 1,
-- live_per_service_partial_index_exists = 1, issuer_check_constraint_exists = 1,
-- row_count = 0. No other table is touched by this migration — diffing any
-- pre-migration snapshot of organizations/business_travellers/
-- travel_requests/travel_request_services/organization_memberships against
-- post-migration state should show zero differences.

-- ROLLBACK: DROP TABLE IF EXISTS business_service_link_tokens;
