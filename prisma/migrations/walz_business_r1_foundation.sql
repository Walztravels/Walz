-- ============================================================
-- WALZ BUSINESS — RELEASE 1: Secure Organization Foundation
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- `prisma db push` / `prisma migrate` — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is returned
-- for review only, per the standing implementation instruction. Nothing in
-- this migration has been executed by the implementing agent.
--
-- SCOPE
--   creates 8 new tables: organizations, organization_memberships,
--           business_travellers, travel_requests, travel_request_travellers,
--           travel_request_services, travel_approvals, business_audit_log
--   adds    0 columns to any existing table
--   alters  0 existing tables, drops 0 columns/tables/indexes
--   touches 0 existing rows anywhere — no backfill of any kind.
--
-- WHY THESE TABLES TRAVEL TOGETHER
--   One feature (the B2B/organization domain foundation): an Organization
--   has Memberships (who can act on its behalf, and at what role),
--   BusinessTravellers (people travel is arranged for, optionally later
--   linked to a real Walz User via explicit verification — never
--   automatically), TravelRequests (what an organization is asking for),
--   which have Travellers (join to BusinessTraveller) and Services (loose
--   links into the mature booking domain) and Approvals (who signed off).
--   business_audit_log is the single append-only audit trail for every
--   mutation across all of the above. None of the child tables are useful
--   without their parents.
--
-- RELATIONSHIP TO EXISTING SYSTEMS — READ BEFORE RUNNING
--   This migration adds NO column to "Quote"/quotes, "VisaApplication",
--   "Itinerary", or "Trip", and does not alter their shape in any way.
--   travel_request_services holds nullable FK columns POINTING AT those
--   tables (linked_quote_id -> quotes.id, etc.) so that organization scope
--   for a Quote/VisaApplication/Itinerary/Trip is resolved by joining
--   through travel_request_services — never by a column on those tables
--   themselves. Foreign keys below are all ON DELETE SET NULL, so deleting
--   a Quote/VisaApplication/Itinerary/Trip elsewhere in the app can never
--   fail or cascade unexpectedly because of this new domain.
--
--   accountManagerId on organizations and createdBy on business_travellers
--   are plain TEXT columns referencing Staff.email — deliberately NOT a
--   hard FK to "Staff", matching how quotes.created_by already references
--   Staff.email as a loose string (see prisma/migrations/add_quotes_system.sql
--   precedent) rather than a hard FK.
--
-- AUTHORIZATION
--   Every API route reading/writing these tables goes through
--   lib/business/authz.ts::assertOrgScopedAccess() /
--   assertSensitiveDocumentAccess(), which always re-reads
--   organization_memberships fresh from the DB — no row here is ever
--   trusted from a client-supplied value. See that file for the documented
--   role ordering and the locked "sensitive documents = ADMIN/OWNER only"
--   product decision.
--
-- DELIBERATELY NOT BUILT HERE (see mission brief's "deferred" list) —
--   no subscription billing, no prepaid balance, no enterprise credit, no
--   invoicing, no multi-step approval POLICIES (this migration supports a
--   single decision per (request, approver) — see the unique constraint on
--   travel_approvals below), no bulk visa UX, no Jade for Business, no
--   self-service signup (staff-only organization creation, enforced in
--   app/api/admin/business/organizations/route.ts via the 'b2b.manage'
--   permission — there is no other organization-creation code path).
--
-- CONVENTION: snake_case tables/columns + TEXT/CHECK for status-like
--   fields, matching this repo's established convention for recent
--   hand-run migrations — see prisma/migrations/jade_travel_club_v1.sql and
--   prisma/migrations/staff_checkin_v2.sql for precedent.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS business_audit_log;
--   DROP TABLE IF EXISTS travel_approvals;
--   DROP TABLE IF EXISTS travel_request_services;
--   DROP TABLE IF EXISTS travel_request_travellers;
--   DROP TABLE IF EXISTS travel_requests;
--   DROP TABLE IF EXISTS business_travellers;
--   DROP TABLE IF EXISTS organization_memberships;
--   DROP TABLE IF EXISTS organizations;
--   (Safe: nothing outside this migration references these tables. No
--   existing table/column is touched by this migration.)
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. organizations
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id                    text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  legal_name            text        NOT NULL,
  trading_name          text,
  registration_number   text,
  country               text        NOT NULL,
  billing_address       text,
  business_email        text        NOT NULL,
  business_phone        text,
  status                text        NOT NULL DEFAULT 'LEAD',
  account_manager_id    text,       -- Staff.email, no hard FK (see header)
  default_currency      text        NOT NULL DEFAULT 'GBP',
  market                text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_organizations_status') THEN
    ALTER TABLE organizations
      ADD CONSTRAINT chk_organizations_status
      CHECK (status IN ('LEAD','ONBOARDING','ACTIVE','SUSPENDED','CLOSED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations (status);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE organizations FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_organizations" ON organizations
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. organization_memberships — one row per (organization, user);
--    role/status re-read fresh by lib/business/authz.ts on every request,
--    never trusted from a client.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_memberships (
  id                text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id   text        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           text        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'INVITED',
  invited_by        text,       -- staff or member email, no hard FK
  joined_at         timestamptz,
  last_activity_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_memberships_org_user_key') THEN
    ALTER TABLE organization_memberships
      ADD CONSTRAINT organization_memberships_org_user_key UNIQUE (organization_id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_organization_memberships_role') THEN
    ALTER TABLE organization_memberships
      ADD CONSTRAINT chk_organization_memberships_role
      CHECK (role IN ('OWNER','ADMIN','TRAVEL_MANAGER','APPROVER','FINANCE','TRAVELLER','COORDINATOR'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_organization_memberships_status') THEN
    ALTER TABLE organization_memberships
      ADD CONSTRAINT chk_organization_memberships_status
      CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','REMOVED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organization_memberships_user_id ON organization_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_organization_memberships_org_id  ON organization_memberships (organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_memberships_status  ON organization_memberships (status);

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE organization_memberships FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_organization_memberships" ON organization_memberships
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. business_travellers — user_id is an EXPLICIT-VERIFICATION-ONLY claim,
--    never set automatically on email match (locked product decision).
--    status has no CHECK constraint: the mission brief specifies only a
--    default ('active') and no enumerated vocabulary, so none is invented
--    here — validate in TypeScript if/when a fixed vocabulary is decided.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_travellers (
  id                        text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id           text        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                   text        REFERENCES "User"(id) ON DELETE SET NULL,
  first_name                text        NOT NULL,
  last_name                 text        NOT NULL,
  email                     text        NOT NULL,
  phone                     text,
  status                    text        NOT NULL DEFAULT 'active',
  created_by                text        NOT NULL, -- staff or member identifier, no hard FK
  claim_verification_token  text        UNIQUE,
  claim_verified_at         timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_travellers_org_id  ON business_travellers (organization_id);
CREATE INDEX IF NOT EXISTS idx_business_travellers_user_id ON business_travellers (user_id);
CREATE INDEX IF NOT EXISTS idx_business_travellers_email   ON business_travellers (email);

ALTER TABLE business_travellers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE business_travellers FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_business_travellers" ON business_travellers
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. travel_requests — deliberately its OWN status vocabulary, not
--    TripStatus and not VisaApplication.status.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travel_requests (
  id                          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id             text        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submitted_by_membership_id  text        NOT NULL REFERENCES organization_memberships(id) ON DELETE RESTRICT,
  status                      text        NOT NULL DEFAULT 'DRAFT',
  title                       text,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_travel_requests_status') THEN
    ALTER TABLE travel_requests
      ADD CONSTRAINT chk_travel_requests_status
      CHECK (status IN ('DRAFT','SUBMITTED','AWAITING_APPROVAL','APPROVED','REJECTED','IN_PROGRESS','COMPLETED','CANCELLED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_travel_requests_org_id     ON travel_requests (organization_id);
CREATE INDEX IF NOT EXISTS idx_travel_requests_submitted_by ON travel_requests (submitted_by_membership_id);
CREATE INDEX IF NOT EXISTS idx_travel_requests_status     ON travel_requests (status);

ALTER TABLE travel_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE travel_requests FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_travel_requests" ON travel_requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. travel_request_travellers — join table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travel_request_travellers (
  id                     text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  travel_request_id      text        NOT NULL REFERENCES travel_requests(id) ON DELETE CASCADE,
  business_traveller_id  text        NOT NULL REFERENCES business_travellers(id) ON DELETE CASCADE,
  created_at             timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_request_travellers_req_traveller_key') THEN
    ALTER TABLE travel_request_travellers
      ADD CONSTRAINT travel_request_travellers_req_traveller_key UNIQUE (travel_request_id, business_traveller_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_travel_request_travellers_traveller ON travel_request_travellers (business_traveller_id);

ALTER TABLE travel_request_travellers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE travel_request_travellers FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_travel_request_travellers" ON travel_request_travellers
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. travel_request_services — the ONLY place organization scope for the
--    mature booking domain is resolved (by joining through this table).
--    All four linked_*_id FKs are nullable + ON DELETE SET NULL: deleting a
--    Quote/VisaApplication/Itinerary/Trip elsewhere can never fail or
--    cascade because of this table, and "quotes"/"VisaApplication"/
--    "Itinerary"/"Trip" themselves are not modified by this migration.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travel_request_services (
  id                            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  travel_request_id             text        NOT NULL REFERENCES travel_requests(id) ON DELETE CASCADE,
  service_type                  text        NOT NULL,
  linked_quote_id                text        REFERENCES quotes(id) ON DELETE SET NULL,
  linked_visa_application_id     text        REFERENCES "VisaApplication"(id) ON DELETE SET NULL,
  linked_itinerary_id            text        REFERENCES "Itinerary"(id) ON DELETE SET NULL,
  linked_trip_id                 text        REFERENCES "Trip"(id) ON DELETE SET NULL,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_travel_request_services_type') THEN
    ALTER TABLE travel_request_services
      ADD CONSTRAINT chk_travel_request_services_type
      CHECK (service_type IN ('FLIGHT','HOTEL','VISA','TRANSFER','ESIM','ITINERARY'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_travel_request_services_request ON travel_request_services (travel_request_id);
CREATE INDEX IF NOT EXISTS idx_travel_request_services_quote   ON travel_request_services (linked_quote_id);
CREATE INDEX IF NOT EXISTS idx_travel_request_services_visa    ON travel_request_services (linked_visa_application_id);
CREATE INDEX IF NOT EXISTS idx_travel_request_services_itin    ON travel_request_services (linked_itinerary_id);
CREATE INDEX IF NOT EXISTS idx_travel_request_services_trip    ON travel_request_services (linked_trip_id);

ALTER TABLE travel_request_services ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE travel_request_services FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_travel_request_services" ON travel_request_services
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 7. travel_approvals — decision is IMMUTABLE once APPROVED/REJECTED with a
--    non-null decided_at (enforced in application code via an atomic
--    compare-and-swap updateMany(), never a plain update() — see
--    app/api/business/organizations/[id]/requests/[requestId]/approve/route.ts
--    — not by a DB trigger in Release 1). The unique constraint below is
--    single-decision-per-(request, approver): multi-step approval POLICIES
--    are explicitly deferred.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travel_approvals (
  id                       text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  travel_request_id        text        NOT NULL REFERENCES travel_requests(id) ON DELETE CASCADE,
  approver_membership_id   text        NOT NULL REFERENCES organization_memberships(id) ON DELETE RESTRICT,
  decision                 text        NOT NULL DEFAULT 'PENDING',
  decided_at               timestamptz,
  reason                   text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_approvals_req_approver_key') THEN
    ALTER TABLE travel_approvals
      ADD CONSTRAINT travel_approvals_req_approver_key UNIQUE (travel_request_id, approver_membership_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_travel_approvals_decision') THEN
    ALTER TABLE travel_approvals
      ADD CONSTRAINT chk_travel_approvals_decision
      CHECK (decision IN ('PENDING','APPROVED','REJECTED','EXPIRED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_travel_approvals_decided_at') THEN
    ALTER TABLE travel_approvals
      ADD CONSTRAINT chk_travel_approvals_decided_at
      CHECK (decision NOT IN ('APPROVED','REJECTED') OR decided_at IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_travel_approvals_request  ON travel_approvals (travel_request_id);
CREATE INDEX IF NOT EXISTS idx_travel_approvals_approver ON travel_approvals (approver_membership_id);

ALTER TABLE travel_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE travel_approvals FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_travel_approvals" ON travel_approvals
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 8. business_audit_log — sole writer is
--    lib/business/audit.ts::recordBusinessAudit(). organization_id is
--    nullable + ON DELETE SET NULL so the audit trail survives even if an
--    organization row is ever removed.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_audit_log (
  id               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id  text        REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id    text,   -- User.id, no hard FK (audit rows must outlive the actor)
  actor_staff_id   text,   -- Staff.id or email, no hard FK
  action           text        NOT NULL,
  entity_type      text        NOT NULL,
  entity_id        text,
  before           jsonb,
  after            jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_audit_log_org_id       ON business_audit_log (organization_id);
CREATE INDEX IF NOT EXISTS idx_business_audit_log_entity       ON business_audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_business_audit_log_created_at   ON business_audit_log (created_at);

ALTER TABLE business_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE business_audit_log FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_business_audit_log" ON business_audit_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDATION — run after the migration
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'organizations')              AS organizations_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'organization_memberships')   AS memberships_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'business_travellers')        AS travellers_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'travel_requests')            AS requests_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'travel_request_travellers')  AS request_travellers_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'travel_request_services')    AS request_services_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'travel_approvals')           AS approvals_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'business_audit_log')         AS audit_log_table_exists,
  (SELECT count(*) FROM organizations)              AS organization_row_count,   -- Expect: 0 (no backfill)
  (SELECT count(*) FROM organization_memberships)   AS membership_row_count,     -- Expect: 0 (no backfill)
  (SELECT count(*) FROM business_travellers)        AS traveller_row_count,      -- Expect: 0 (no backfill)
  (SELECT count(*) FROM travel_requests)            AS request_row_count,        -- Expect: 0 (no backfill)
  (SELECT count(*) FROM business_audit_log)         AS audit_row_count;          -- Expect: 0 (no backfill)
-- Expect: all eight *_table_exists = 1, all row counts = 0 (this migration
-- creates schema only — no rows are ever inserted by it).
