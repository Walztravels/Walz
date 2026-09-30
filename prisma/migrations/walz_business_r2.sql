-- ============================================================
-- WALZ BUSINESS — RELEASE 2: claim-token expiry + explicit membership
-- capabilities (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- `prisma db push` / `prisma migrate` — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is returned
-- for review only, per the standing implementation instruction. Nothing in
-- this migration has been executed by the implementing agent.
--
-- PREREQUISITE: prisma/migrations/walz_business_r1_foundation.sql has
-- already been run (business_travellers and organization_memberships must
-- exist).
--
-- SCOPE
--   adds    1 nullable column to an existing R1 table:
--             business_travellers.claim_token_expires_at (timestamptz NULL)
--   creates 1 new table: organization_membership_capabilities
--   alters  0 other tables, drops 0 columns/tables/indexes
--   touches 0 existing rows anywhere — no backfill of any kind. In
--           particular organizations.default_currency is NOT touched: every
--           existing organization (including the production acceptance-test
--           organization) keeps its current currency. Changing an existing
--           organization's currency is only possible through the new,
--           audited, reason-required admin action
--           (app/api/admin/business/organizations/[id]/currency/route.ts).
--
-- 1. business_travellers.claim_token_expires_at
--   The R1 claim token (claim_verification_token) had no expiry. R2 adds a
--   hard expiry. Application code (lib/business/claim.ts) treats a NULL
--   expiry as EXPIRED (fail closed), so any R1-era token that was ever
--   generated (there are no callers in R1, so none are expected) can never
--   be consumed without being re-issued.
--
-- 2. organization_membership_capabilities
--   An EXPLICIT, staff-granted, reason-required, audited capability layered
--   on top of an organization membership. The only capability in R2 is
--   VISA_DOCUMENTS_VIEW (see lib/business/capabilities.ts). It is never
--   inferred from an org role and never from a staff permission. ADMIN/OWNER
--   keep their hardcoded baseline in lib/business/authz.ts without needing a
--   row here. Rows are never deleted by the application: a revoke stamps
--   revoked_at/revoked_by_staff_id/revoke_reason (append-only history). The
--   partial unique index guarantees at most one un-revoked grant per
--   (membership, capability) even under concurrent grants.
--
-- CONVENTION: snake_case + TEXT/CHECK for status-like fields, RLS enabled
--   with one service_role-only policy, matching
--   prisma/migrations/walz_business_r1_foundation.sql.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS organization_membership_capabilities;
--   ALTER TABLE business_travellers DROP COLUMN IF EXISTS claim_token_expires_at;
--   (Safe: nothing outside Walz Business R2 code reads either object. After
--   rollback, R2 claim consumption fails closed — a NULL/absent expiry is
--   always treated as expired — and the visa-document capability check
--   falls back to the ADMIN/OWNER-only baseline.)
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. business_travellers.claim_token_expires_at — additive, nullable, no
--    default, no backfill.
-- ────────────────────────────────────────────────────────────
ALTER TABLE business_travellers
  ADD COLUMN IF NOT EXISTS claim_token_expires_at timestamptz;

-- ────────────────────────────────────────────────────────────
-- 2. organization_membership_capabilities
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_membership_capabilities (
  id                    text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  membership_id         text        NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
  organization_id       text        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  capability            text        NOT NULL,
  granted_by_staff_id   text        NOT NULL, -- Staff.id or email, no hard FK
  grant_reason          text        NOT NULL,
  granted_at            timestamptz NOT NULL DEFAULT now(),
  revoked_at            timestamptz,
  revoked_by_staff_id   text,                 -- Staff.id or email, no hard FK
  revoke_reason         text
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_membership_capabilities_capability') THEN
    ALTER TABLE organization_membership_capabilities
      ADD CONSTRAINT chk_org_membership_capabilities_capability
      CHECK (capability IN ('VISA_DOCUMENTS_VIEW'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_membership_capabilities_grant_reason') THEN
    ALTER TABLE organization_membership_capabilities
      ADD CONSTRAINT chk_org_membership_capabilities_grant_reason
      CHECK (length(btrim(grant_reason)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_membership_capabilities_revoke') THEN
    ALTER TABLE organization_membership_capabilities
      ADD CONSTRAINT chk_org_membership_capabilities_revoke
      CHECK (revoked_at IS NULL OR (revoked_by_staff_id IS NOT NULL AND revoke_reason IS NOT NULL AND length(btrim(revoke_reason)) > 0));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_membership_capabilities_membership ON organization_membership_capabilities (membership_id);
CREATE INDEX IF NOT EXISTS idx_org_membership_capabilities_org        ON organization_membership_capabilities (organization_id);
-- At most one ACTIVE (un-revoked) grant per (membership, capability).
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_membership_capabilities_active
  ON organization_membership_capabilities (membership_id, capability)
  WHERE revoked_at IS NULL;

ALTER TABLE organization_membership_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE organization_membership_capabilities FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_organization_membership_capabilities" ON organization_membership_capabilities
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDATION — run after the migration
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'business_travellers' AND column_name = 'claim_token_expires_at')        AS claim_expiry_column_exists,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'organization_membership_capabilities')                                  AS capabilities_table_exists,
  (SELECT count(*) FROM organization_membership_capabilities)                                     AS capability_row_count,   -- Expect: 0 (no backfill)
  (SELECT count(*) FROM business_travellers WHERE claim_token_expires_at IS NOT NULL)             AS travellers_with_expiry; -- Expect: 0 (no backfill)
-- Expect: claim_expiry_column_exists = 1, capabilities_table_exists = 1,
-- both row counts = 0. organizations.default_currency is untouched:
--   SELECT legal_name, default_currency FROM organizations ORDER BY created_at;
-- should return exactly the same values as before running this file.
