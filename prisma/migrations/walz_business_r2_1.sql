-- ============================================================
-- WALZ BUSINESS — RELEASE 2.1: partner types + agency visa submission
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- `prisma db push` / `prisma migrate` — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is returned
-- for review only, per the standing implementation instruction. Nothing in
-- this migration has been executed by the implementing agent.
--
-- PREREQUISITE: prisma/migrations/walz_business_r1_foundation.sql and
-- prisma/migrations/walz_business_r2.sql have already been run.
--
-- SCOPE
--   adds    2 NOT NULL columns (with defaults) to existing tables:
--             organizations.organization_type       (text, default 'CORPORATE')
--             business_travellers.traveller_kind     (text, default 'EMPLOYEE')
--   adds    1 NOT NULL column (with default) to a pre-existing,
--           differently-cased table (see note below):
--             "VisaCaseDocument"."scanStatus"        (text, default 'SCAN_UNAVAILABLE')
--   creates 3 new tables:
--             organization_invitations
--             organization_brand_settings
--             travel_request_service_attestations
--   alters  0 other tables, drops 0 columns/tables/indexes
--   backfill: EXACTLY TWO explicit UPDATE statements (Section 1 and
--           Section 2 below), each setting every pre-existing row of one
--           table to the new column's default value. NO OTHER ROW ANYWHERE
--           is touched by this migration. In particular
--           organizations.default_currency, organizations.status, and every
--           other existing column are NOT touched.
--
-- WHY THESE OBJECTS TRAVEL TOGETHER
--   R2.1 lets a Travel Agency organization run a visa case on behalf of its
--   own end clients (as opposed to a Corporate organization arranging travel
--   for its own employees). That requires knowing WHAT KIND of organization
--   this is (organization_type), WHAT KIND of traveller a roster row
--   represents (traveller_kind — employee vs. an agency's own client), a way
--   to record WHO actually submitted case information for audit purposes
--   (travel_request_service_attestations), a converged way to invite an
--   organization's very first administrator before any membership exists at
--   all (organization_invitations — closes a chicken-and-egg gap in R1/R2),
--   a schema-level placeholder marking uploaded files as untrusted until a
--   scanner exists ("VisaCaseDocument"."scanStatus"), and an optional,
--   presentation-only white-label layer (organization_brand_settings).
--
-- 1. organizations.organization_type
--   CORPORATE | TRAVEL_AGENCY | REFERRAL_PARTNER. NOT NULL DEFAULT
--   'CORPORATE'. Backfilled explicitly (Section 1 below) to CORPORATE for
--   EVERY existing organization — including the "Walz Business Acceptance
--   Test" organization, whose known purpose (an internal acceptance-test
--   org, not an agency or referral partner) supports that classification
--   per explicit authorization in the mission brief. This is the ONLY place
--   any existing row's organization_type is ever set by this migration; the
--   application can change it after creation only through
--   app/api/admin/business/organizations/[id]/organization-type/route.ts
--   (b2b.manage + mandatory reason + audit).
--
-- 2. business_travellers.traveller_kind
--   EMPLOYEE | CLIENT. NOT NULL DEFAULT 'EMPLOYEE'. Backfilled explicitly
--   (Section 2 below) to EMPLOYEE for every existing traveller row — every
--   traveller created before R2.1 was created under the employee-roster
--   model, never the agency-client model, so EMPLOYEE is the only accurate
--   backfill value. Does NOT change claim_verified_at/user_id/status for any
--   row — the claim-verification ownership evidence
--   (lib/business/services.ts::OWNERSHIP_CLAIMED_TRAVELLER) is completely
--   unaffected and is reused verbatim for CLIENT-kind rows.
--
-- 3. organization_invitations
--   The ONE converged invitation system (bootstrap + subsequent-member
--   invites — see lib/business/invitations.ts). Only tokenHash (SHA-256 hex
--   of a crypto.randomBytes(32) token) is ever stored — never the raw
--   token, following the Quotes/Proposals precedent
--   (app/api/quote-proposal/[token]/route.ts), not the traveller-claim
--   flow's raw-token precedent, because this grants organization
--   ADMINISTRATIVE access. A partial unique index guarantees at most one
--   un-consumed invitation per (organization, email) at a time; re-issuing
--   deletes the prior un-consumed row before inserting the new one
--   (lib/business/invitations.ts::issueOrganizationInvitation, inside one
--   transaction) — "reissue replaces prior token", matching claim.ts.
--
-- 4. organization_brand_settings
--   Additive, 1:1 with organizations. PRESENTATION ONLY — white_label_enabled
--   never changes what legal/regulatory/government-facing/payment
--   disclosures show (always the real Walz/operator identity). No custom
--   domains modeled anywhere.
--
-- 5. travel_request_service_attestations
--   Append-only (application code never updates or deletes a row — see
--   lib/business/attestation.ts). Modeled directly on the
--   consent_records/consent_events capture discipline: server-captured
--   ip/user-agent, a strict `attested === true` gate in application code
--   before any row is written, identity (membership_id) always drawn from
--   the caller's own authenticated session, never the request body.
--   attestation_version is a placeholder string only — no finalized legal
--   wording is introduced by this migration or by the application code that
--   writes this table.
--
-- 6. "VisaCaseDocument"."scanStatus"
--   PENDING_SCAN | SCAN_UNAVAILABLE | CLEAN | QUARANTINED. NOT NULL DEFAULT
--   'SCAN_UNAVAILABLE' (no malware scanner exists anywhere in this codebase
--   today — this is a schema-level placeholder boundary only, never a claim
--   that scanning happens). NOTE ON CASING: "VisaCaseDocument" is a
--   pre-existing table from prisma/migrations/di2_evidence_engine.sql that
--   uses quoted CamelCase table/column identifiers (no @@map in its Prisma
--   model), unlike the snake_case convention used by every other table in
--   this migration and in walz_business_r1_foundation.sql /
--   walz_business_r2.sql. This ALTER TABLE matches THAT table's own existing
--   casing convention rather than introducing a mismatched snake_case column
--   on an already-CamelCase table.
--
-- CONVENTION: snake_case tables/columns + TEXT/CHECK for status-like fields
--   (matching walz_business_r1_foundation.sql / walz_business_r2.sql) for
--   every NEW table and for the two ADDED columns on existing snake_case
--   tables. RLS enabled with one service_role-only policy on every new
--   table, identical to R1/R2 — this is NOT row-level tenant isolation at
--   the DB layer; tenant isolation is 100% application-code
--   (lib/business/authz.ts, lib/business/org-type-gate.ts).
--
-- DELIBERATELY NOT BUILT HERE (see mission scope)
--   - No corporate credit/billing.
--   - No commission percentages, payout thresholds, eligibility windows, or
--     clawback rules for referral partners — no columns for any of these
--     exist anywhere in this migration.
--   - No domain-level white-labeling / custom domains.
--   - No malware scanner — "scanStatus" is a placeholder column only.
--   - No B2B-specific visa application table — every agency visa case still
--     converges on the existing VisaApplication via
--     TravelRequestService.linkedVisaApplicationId, unchanged.
--   - No general document replace/delete capability.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS travel_request_service_attestations;
--   DROP TABLE IF EXISTS organization_brand_settings;
--   DROP TABLE IF EXISTS organization_invitations;
--   ALTER TABLE "VisaCaseDocument" DROP COLUMN IF EXISTS "scanStatus";
--   ALTER TABLE business_travellers DROP COLUMN IF EXISTS traveller_kind;
--   ALTER TABLE organizations DROP COLUMN IF EXISTS organization_type;
--   (Safe: nothing outside Walz Business R2.1 code reads any of these
--   objects/columns. After rollback, every route added in this release
--   becomes unreachable at the Prisma-client level and must be redeployed
--   only alongside a re-run of this migration.)
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. organizations.organization_type — additive, NOT NULL DEFAULT
--    'CORPORATE'. Explicit, auditable backfill of EVERY existing row
--    (including the "Walz Business Acceptance Test" organization) to
--    CORPORATE — see the header note above for the explicit authorization.
-- ────────────────────────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS organization_type text NOT NULL DEFAULT 'CORPORATE';

-- EXPLICIT BACKFILL (the only UPDATE in this section): every organization
-- that existed before this migration is classified CORPORATE. This is a
-- no-op for any row the ADD COLUMN ... DEFAULT already set to 'CORPORATE',
-- written out explicitly so it is visible, commented, and auditable rather
-- than an implicit side effect of the column default.
UPDATE organizations SET organization_type = 'CORPORATE' WHERE organization_type IS NULL OR organization_type = 'CORPORATE';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_organizations_organization_type') THEN
    ALTER TABLE organizations
      ADD CONSTRAINT chk_organizations_organization_type
      CHECK (organization_type IN ('CORPORATE', 'TRAVEL_AGENCY', 'REFERRAL_PARTNER'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizations_organization_type ON organizations (organization_type);

-- ────────────────────────────────────────────────────────────
-- 2. business_travellers.traveller_kind — additive, NOT NULL DEFAULT
--    'EMPLOYEE'. Explicit, auditable backfill of every existing row.
-- ────────────────────────────────────────────────────────────
ALTER TABLE business_travellers
  ADD COLUMN IF NOT EXISTS traveller_kind text NOT NULL DEFAULT 'EMPLOYEE';

-- EXPLICIT BACKFILL (the only UPDATE in this section): every traveller row
-- that existed before this migration is classified EMPLOYEE.
UPDATE business_travellers SET traveller_kind = 'EMPLOYEE' WHERE traveller_kind IS NULL OR traveller_kind = 'EMPLOYEE';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_business_travellers_traveller_kind') THEN
    ALTER TABLE business_travellers
      ADD CONSTRAINT chk_business_travellers_traveller_kind
      CHECK (traveller_kind IN ('EMPLOYEE', 'CLIENT'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_business_travellers_traveller_kind ON business_travellers (traveller_kind);

-- ────────────────────────────────────────────────────────────
-- 3. organization_invitations
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_invitations (
  id                        text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id           text        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email                     text        NOT NULL,
  role                      text        NOT NULL,
  token_hash                text        NOT NULL,
  invited_by_staff_id       text,                 -- Staff.id or email, no hard FK
  invited_by_membership_id  text REFERENCES organization_memberships(id) ON DELETE SET NULL,
  expires_at                timestamptz NOT NULL,
  consumed_at               timestamptz,
  consumed_by_user_id       text REFERENCES "User"(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_invitations_role') THEN
    ALTER TABLE organization_invitations
      ADD CONSTRAINT chk_org_invitations_role
      CHECK (role IN ('OWNER', 'ADMIN', 'TRAVEL_MANAGER', 'APPROVER', 'FINANCE', 'COORDINATOR', 'TRAVELLER'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_invitations_issuer') THEN
    ALTER TABLE organization_invitations
      ADD CONSTRAINT chk_org_invitations_issuer
      CHECK (invited_by_staff_id IS NOT NULL OR invited_by_membership_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_invitations_consumed_pair') THEN
    ALTER TABLE organization_invitations
      ADD CONSTRAINT chk_org_invitations_consumed_pair
      CHECK ((consumed_at IS NULL) = (consumed_by_user_id IS NULL));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_invitations_token_hash ON organization_invitations (token_hash);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org       ON organization_invitations (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email     ON organization_invitations (email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_expires   ON organization_invitations (expires_at);
-- At most one UN-CONSUMED invitation per (organization, email) at a time —
-- reissuing deletes the prior un-consumed row first (application code, one
-- transaction), so this index is never violated by the app's own reissue
-- path; it exists to make any other write path that skips that step fail
-- loudly instead of silently creating a second live invitation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_invitations_active_per_org_email
  ON organization_invitations (organization_id, email)
  WHERE consumed_at IS NULL;

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE organization_invitations FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_organization_invitations" ON organization_invitations
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. organization_brand_settings
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_brand_settings (
  organization_id            text        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  display_name               text,
  logo_url                   text,
  brand_color                text,
  support_email              text,
  support_phone              text,
  client_facing_sender_name  text,
  white_label_enabled        boolean     NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization_brand_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE organization_brand_settings FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_organization_brand_settings" ON organization_brand_settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. travel_request_service_attestations (append-only)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travel_request_service_attestations (
  id                          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  travel_request_service_id  text        NOT NULL REFERENCES travel_request_services(id) ON DELETE CASCADE,
  organization_id             text        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id               text        NOT NULL REFERENCES organization_memberships(id) ON DELETE RESTRICT,
  visa_application_id         text,       -- loose reference, matching TravelRequestService's own convention; no hard FK to VisaApplication's differently-cased table
  attestation_version         text        NOT NULL,
  attested_at                 timestamptz NOT NULL,
  ip_address                  text,
  user_agent                  text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trs_attestations_service ON travel_request_service_attestations (travel_request_service_id);
CREATE INDEX IF NOT EXISTS idx_trs_attestations_org      ON travel_request_service_attestations (organization_id);
CREATE INDEX IF NOT EXISTS idx_trs_attestations_member   ON travel_request_service_attestations (membership_id);
CREATE INDEX IF NOT EXISTS idx_trs_attestations_visa      ON travel_request_service_attestations (visa_application_id);

ALTER TABLE travel_request_service_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE travel_request_service_attestations FROM anon, authenticated;
DO $$ BEGIN
  CREATE POLICY "service_role_travel_request_service_attestations" ON travel_request_service_attestations
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. "VisaCaseDocument"."scanStatus" — matches that table's own pre-existing
--    quoted-CamelCase convention (see header note). Additive, NOT NULL
--    DEFAULT 'SCAN_UNAVAILABLE'. No backfill UPDATE needed — the column
--    default already applies to every existing row via ADD COLUMN.
-- ────────────────────────────────────────────────────────────
ALTER TABLE "VisaCaseDocument"
  ADD COLUMN IF NOT EXISTS "scanStatus" text NOT NULL DEFAULT 'SCAN_UNAVAILABLE';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_visacasedocument_scanstatus') THEN
    ALTER TABLE "VisaCaseDocument"
      ADD CONSTRAINT chk_visacasedocument_scanstatus
      CHECK ("scanStatus" IN ('PENDING_SCAN', 'SCAN_UNAVAILABLE', 'CLEAN', 'QUARANTINED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "VisaCaseDocument_scanStatus_idx" ON "VisaCaseDocument" ("scanStatus");

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDATION — run after the migration
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'organization_type')            AS org_type_column_exists,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'business_travellers' AND column_name = 'traveller_kind')          AS traveller_kind_column_exists,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'VisaCaseDocument' AND column_name = 'scanStatus')                 AS scan_status_column_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'organization_invitations')                                         AS invitations_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'organization_brand_settings')                                      AS brand_settings_table_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'travel_request_service_attestations')                              AS attestations_table_exists,
  (SELECT count(*) FROM organizations WHERE organization_type != 'CORPORATE')                                                             AS non_corporate_orgs, -- Expect: 0 immediately after this migration
  (SELECT count(*) FROM business_travellers WHERE traveller_kind != 'EMPLOYEE')                                                           AS non_employee_travellers, -- Expect: 0 immediately after this migration
  (SELECT count(*) FROM organization_invitations)                                                                                         AS invitation_row_count, -- Expect: 0 (no backfill — brand new table)
  (SELECT count(*) FROM organization_brand_settings)                                                                                      AS brand_settings_row_count, -- Expect: 0 (no backfill — brand new table)
  (SELECT count(*) FROM travel_request_service_attestations)                                                                              AS attestation_row_count; -- Expect: 0 (no backfill — brand new table)
-- Expect: every *_exists / *_table_exists column = 1 (or higher for the
-- duplicated-name VisaCaseDocument column check, which should still be 1),
-- non_corporate_orgs = 0, non_employee_travellers = 0, and all three new
-- table row counts = 0. To re-confirm zero unintended mutation of anything
-- else, diff `SELECT id, status, default_currency FROM organizations ORDER
-- BY created_at` and `SELECT id, status, claim_verified_at, user_id FROM
-- business_travellers ORDER BY created_at` against a pre-migration snapshot
-- — both should be byte-identical except for the two new columns.
