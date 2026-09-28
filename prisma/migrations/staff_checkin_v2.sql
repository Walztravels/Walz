-- ============================================================
-- STAFF CHECK-IN V2 — manual attendance + real missed-check-in
-- deductions (idempotent, hand-run in the Supabase SQL Editor).
-- NEVER via prisma db push / prisma migrate — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is
-- returned for review only. It has NOT been executed by the
-- implementing agent.
--
-- SCOPE
--   adds    4 columns to "CheckInRecord"  (status, actualCheckInAt,
--           source, timezoneAtCheckIn)
--   adds    2 columns to "CheckInSettings" (graceMinutes,
--           effectiveDeductionDate)
--   creates 2 new tables: check_in_deduction_policies,
--           check_in_deductions
--   adds    0 foreign keys to "Staff"/"CheckInRecord" other than the
--           two FKs check_in_deductions needs to itself point at
--           staffId/checkInRecordId (mirrors the FK style already used
--           by staff_performance_documents -> staff_performance_cases)
--   alters  0 existing columns, drops 0 columns/tables/indexes
--   touches 0 existing rows anywhere — no backfill of any kind.
--
-- WHY THESE CHANGES TRAVEL TOGETHER
--   All of this belongs to one feature (real, auditable missed-check-in
--   deductions that actually reach payroll) and is useless without each
--   other: the new CheckInRecord columns record the authoritative
--   attendance decision (manual-only, never admin-activity-inferred),
--   check_in_deduction_policies holds the Super-Admin-configured
--   per-country amount that the deduction ledger reads, and
--   check_in_deductions is the one-row-per-occurrence financial ledger
--   that the cron writes to and that a future payroll-generation read
--   consumes.
--
-- FINANCIAL SAFETY (mission brief §19 — read before running)
--   Seeding this migration does NOT create a single deduction. The
--   deduction cron (app/api/cron/check-ins/route.ts) will only ever
--   create a check_in_deductions row for a missed occurrence whose
--   windowStart is ON OR AFTER "CheckInSettings"."effectiveDeductionDate"
--   — and that column is seeded NULL below, which means the policy is
--   completely inert (no financial effect at all, for any staff member,
--   in any currency) until a Super Admin explicitly opens Check-in
--   Settings and sets that date. There is no backfill of historical
--   missed check-ins into deductions anywhere in this migration or in
--   the application code that reads it.
--
-- GHANA AMOUNT — OPEN QUESTION FOR THE OWNER (mission brief §5/§13)
--   The Nigeria row below is seeded at 50 NGN per the mission brief's
--   explicit instruction ("Nigeria ... Amount per missed check-in: 50").
--   This is NOT read from any existing hardcoded value in the codebase —
--   grep confirms CheckInSettings.deductionPerMiss defaults to 0 in the
--   DB today and no literal "50" exists anywhere in the check-in code.
--   Treat 50 NGN as a starting value to confirm/adjust in Settings, not
--   as a previously-verified production number.
--   The Ghana row is seeded with amount = NULL on purpose — there is no
--   existing, first-class "Ghana deduction amount" anywhere in this
--   codebase (only an ad-hoc, un-UI'd Staff.deductionOverride column with
--   no value visible in any migration/seed file). Per the mission brief,
--   this amount is NOT guessed. Ghana deductions stay financially inert
--   until a Super Admin sets this amount via Check-in Settings.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. "CheckInRecord" — additive, nullable/defaulted columns only
-- ────────────────────────────────────────────────────────────
ALTER TABLE "CheckInRecord"
  ADD COLUMN IF NOT EXISTS "status"            text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "actualCheckInAt"   timestamp(3),
  ADD COLUMN IF NOT EXISTS "source"            text,
  ADD COLUMN IF NOT EXISTS "timezoneAtCheckIn" text;

CREATE INDEX IF NOT EXISTS "CheckInRecord_status_idx" ON "CheckInRecord" ("status");

-- ────────────────────────────────────────────────────────────
-- 2. "CheckInSettings" — additive, nullable/defaulted columns only
-- ────────────────────────────────────────────────────────────
ALTER TABLE "CheckInSettings"
  ADD COLUMN IF NOT EXISTS "graceMinutes"           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "effectiveDeductionDate" timestamp(3);

-- ────────────────────────────────────────────────────────────
-- 3. check_in_deduction_policies — per-country deduction amount,
--    Super-Admin-configured. Seeded with NG=50 (brief §13 instruction)
--    and GH=NULL (unconfigured — see header note above).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS check_in_deduction_policies (
  id         text        PRIMARY KEY,
  country    text        NOT NULL,
  currency   text        NOT NULL,
  amount     double precision,
  enabled    boolean     NOT NULL DEFAULT true,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" text
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_in_deduction_policies_country_key'
  ) THEN
    ALTER TABLE check_in_deduction_policies
      ADD CONSTRAINT check_in_deduction_policies_country_key UNIQUE (country);
  END IF;
END $$;

INSERT INTO check_in_deduction_policies (id, country, currency, amount, enabled)
VALUES
  ('checkin-policy-ng', 'NG', 'NGN', 50,   true),
  ('checkin-policy-gh', 'GH', 'GHS', NULL, true)
ON CONFLICT (country) DO NOTHING;

ALTER TABLE check_in_deduction_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE check_in_deduction_policies FROM anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'check_in_deduction_policies' AND policyname = 'service_all_check_in_deduction_policies'
  ) THEN
    CREATE POLICY service_all_check_in_deduction_policies ON check_in_deduction_policies
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. check_in_deductions — the one authoritative financial ledger.
--    One row per (staffId, checkInRecordId), enforced by the unique
--    constraint on "checkInRecordId" — cron retries can never create a
--    second deduction for the same missed occurrence.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS check_in_deductions (
  id                       text        PRIMARY KEY,
  "staffId"                text        NOT NULL,
  "checkInRecordId"        text        NOT NULL,
  reason                   text        NOT NULL DEFAULT 'MISSED_CHECK_IN',
  amount                   double precision NOT NULL,
  currency                 text        NOT NULL,
  status                   text        NOT NULL DEFAULT 'ACTIVE',
  "effectivePayrollPeriod" text        NOT NULL,
  "createdBy"              text        NOT NULL DEFAULT 'system',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "waivedAt"               timestamptz,
  "waivedBy"               text,
  "waiverReason"           text,
  "appliedToPayslipId"     text,
  "appliedAt"              timestamptz
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_in_deductions_checkInRecordId_key'
  ) THEN
    ALTER TABLE check_in_deductions
      ADD CONSTRAINT "check_in_deductions_checkInRecordId_key" UNIQUE ("checkInRecordId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_check_in_deductions_staff') THEN
    ALTER TABLE check_in_deductions
      ADD CONSTRAINT fk_check_in_deductions_staff
      FOREIGN KEY ("staffId") REFERENCES "Staff"(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_check_in_deductions_record') THEN
    ALTER TABLE check_in_deductions
      ADD CONSTRAINT fk_check_in_deductions_record
      FOREIGN KEY ("checkInRecordId") REFERENCES "CheckInRecord"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_check_in_deductions_staff_id   ON check_in_deductions ("staffId");
CREATE INDEX IF NOT EXISTS idx_check_in_deductions_status     ON check_in_deductions (status);
CREATE INDEX IF NOT EXISTS idx_check_in_deductions_period     ON check_in_deductions ("effectivePayrollPeriod");
CREATE INDEX IF NOT EXISTS idx_check_in_deductions_payslip    ON check_in_deductions ("appliedToPayslipId");

ALTER TABLE check_in_deductions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE check_in_deductions FROM anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'check_in_deductions' AND policyname = 'service_all_check_in_deductions'
  ) THEN
    CREATE POLICY service_all_check_in_deductions ON check_in_deductions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 5. Validation
-- ────────────────────────────────────────────────────────────
SELECT
  'staff_checkin_v2' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'CheckInRecord'
       AND column_name IN ('status','actualCheckInAt','source','timezoneAtCheckIn'))      AS checkin_record_cols_expect_4,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'CheckInSettings'
       AND column_name IN ('graceMinutes','effectiveDeductionDate'))                       AS checkin_settings_cols_expect_2,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'check_in_deduction_policies') AS policy_table_expect_1,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'check_in_deductions')          AS ledger_table_expect_1,
  (SELECT COUNT(*) FROM check_in_deduction_policies WHERE country = 'NG' AND amount = 50)             AS ng_policy_seeded_expect_1,
  (SELECT COUNT(*) FROM check_in_deduction_policies WHERE country = 'GH' AND amount IS NULL)          AS gh_policy_unconfigured_expect_1,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'check_in_deductions_checkInRecordId_key')      AS ledger_unique_key_expect_1,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_check_in_deductions_staff')                  AS fk_staff_expect_1,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_check_in_deductions_record')                 AS fk_record_expect_1,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'check_in_deduction_policies')                   AS policy_rls_expect_1,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'check_in_deductions')                            AS ledger_rls_expect_1,
  (SELECT COUNT(*) FROM check_in_deductions)                                                            AS ledger_rows_expect_0,
  (SELECT COUNT(*) FROM "CheckInSettings" WHERE "effectiveDeductionDate" IS NOT NULL)                   AS effective_date_set_expect_0;
-- Expect: staff_checkin_v2 | 4 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0
