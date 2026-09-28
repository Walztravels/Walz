-- ============================================================
-- STAFF PERFORMANCE MANAGEMENT (Warning Letters / PIP) — V1
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- prisma db push / prisma migrate — after running, only `npx prisma
-- generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is
-- returned for review only. It has NOT been executed by the
-- implementing agent.
--
-- SCOPE
--   creates 3 new tables : staff_performance_cases,
--           staff_performance_documents, staff_performance_history
--   adds    4 columns to "Staff" (hire_date, performance_review_exempt,
--           performance_review_exempt_reason, performance_review_exempt_until)
--   adds    0 foreign keys to "Staff" (staffId columns on the new tables
--           are plain strings with no FK, matching the existing
--           repo-wide convention — e.g. Booking.createdByStaffId,
--           Quote.createdBy — so this migration can never fail due to
--           an orphaned staffId, and never cascades a delete)
--   alters  0 existing columns, drops 0 columns/tables/indexes
--   touches 0 existing rows anywhere — no backfill of any kind. Every
--           new "Staff" column is NULL / default-false on every
--           pre-existing row.
--
-- WHY THESE CHANGES TRAVEL TOGETHER
--   All three new tables and all four new Staff columns belong to one
--   feature (Super Admin performance-warning workflow) and are useless
--   without each other — the cases/documents/history tables reference
--   each other's ids, and the two exemption/hireDate Staff columns are
--   read by the SAME eligibility check (lib/performance/roles.ts) that
--   decides whether a staff member appears in the automatic review
--   queue built from these tables.
--
-- AUTHORITATIVE "SALE" DEFINITION (for context — this migration does not
--   touch "Booking" at all): a completed sale = a "Booking" row with
--   status = 'CONFIRMED' AND "paymentStatus" = 'SUCCEEDED', attributed to
--   "Booking"."createdByStaffId", dated by "Booking"."updatedAt". See
--   lib/performance/sales.ts for the full rationale.
--
-- BACKFILL: NONE. hire_date is NULL for every existing staff member
--   (tenure is then treated as "unknown", never as "recently hired" —
--   see lib/performance/roles.ts). performance_review_exempt defaults to
--   false for everyone. The three new tables start completely empty —
--   NO WARNING IS EVER GENERATED OR SENT AUTOMATICALLY, so there is
--   nothing to backfill into them.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. "Staff" — additive, nullable/defaulted columns only
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Staff"
  ADD COLUMN IF NOT EXISTS hire_date                         timestamptz,
  ADD COLUMN IF NOT EXISTS performance_review_exempt         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS performance_review_exempt_reason  text,
  ADD COLUMN IF NOT EXISTS performance_review_exempt_until   timestamptz;

-- ────────────────────────────────────────────────────────────
-- 2. staff_performance_cases — one row per opened performance review
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_performance_cases (
  id                              text        PRIMARY KEY,
  staff_id                        text        NOT NULL,
  status                          text        NOT NULL DEFAULT 'OPEN',
  opened_at                       timestamptz NOT NULL DEFAULT now(),
  opened_by_staff_id              text        NOT NULL,
  opened_by_name                  text        NOT NULL,
  review_period_start             timestamptz NOT NULL,
  review_period_end               timestamptz NOT NULL,
  days_since_last_sale_at_open    integer     NOT NULL,
  last_completed_sale_at_open     timestamptz,
  sales_in_period_at_open         integer     NOT NULL,
  recommended_action              text,
  management_action               text,
  notes                           text,
  mitigating_circumstances        text,
  next_review_date                timestamptz,
  closed_at                       timestamptz,
  closed_by_staff_id              text,
  closed_by_name                  text,
  closure_outcome                 text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_perf_cases_staff_id        ON staff_performance_cases (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_perf_cases_status          ON staff_performance_cases (status);
CREATE INDEX IF NOT EXISTS idx_staff_perf_cases_next_review     ON staff_performance_cases (next_review_date);

-- RLS — service-role only. This app has no Supabase-Auth-issued per-staff
-- JWT; the application layer (requireSuperAdmin / requireAuthenticatedStaff
-- in lib/performance/authz.ts) is the real access-control boundary. The
-- REVOKE here just stops a holder of the public anon key from reading or
-- writing this confidential HR table directly, matching every other
-- table in this codebase that carries the same comment.
ALTER TABLE staff_performance_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE staff_performance_cases FROM anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'staff_performance_cases' AND policyname = 'service_all_staff_performance_cases'
  ) THEN
    CREATE POLICY service_all_staff_performance_cases ON staff_performance_cases
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. staff_performance_documents — draft/approved/issued warning letters
--    and PIPs. issued_content + issued_content_hash are the immutable
--    snapshot (mission brief §7) — application code never overwrites
--    them once set.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_performance_documents (
  id                          text        PRIMARY KEY,
  case_id                     text        NOT NULL,
  staff_id                    text        NOT NULL,
  version                     integer     NOT NULL DEFAULT 1,
  warning_type                text        NOT NULL,
  status                      text        NOT NULL DEFAULT 'DRAFT',
  employee_name_snapshot      text        NOT NULL,
  job_title_snapshot          text        NOT NULL,
  department_snapshot         text        NOT NULL,
  review_period_start         timestamptz NOT NULL,
  review_period_end           timestamptz NOT NULL,
  sales_in_period             integer     NOT NULL,
  last_sale_date              timestamptz,
  warning_history_summary     text        NOT NULL,
  required_improvement        text        NOT NULL,
  pip_duration_days           integer,
  review_date                 timestamptz NOT NULL,
  additional_notes            text,
  issued_by_staff_id          text,
  issued_by_name              text,
  draft_content                text       NOT NULL,
  issued_content               text,
  issued_content_hash          text,
  delivered_at                 timestamptz,
  opened_at                    timestamptz,
  acknowledged_at              timestamptz,
  acknowledgement_text         text,
  employee_response            text,
  employee_response_at         timestamptz,
  email_message_id             text,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_staff_perf_documents_case') THEN
    ALTER TABLE staff_performance_documents
      ADD CONSTRAINT fk_staff_perf_documents_case
      FOREIGN KEY (case_id) REFERENCES staff_performance_cases(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_perf_documents_case_id   ON staff_performance_documents (case_id);
CREATE INDEX IF NOT EXISTS idx_staff_perf_documents_staff_id  ON staff_performance_documents (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_perf_documents_status    ON staff_performance_documents (status);

ALTER TABLE staff_performance_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE staff_performance_documents FROM anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'staff_performance_documents' AND policyname = 'service_all_staff_performance_documents'
  ) THEN
    CREATE POLICY service_all_staff_performance_documents ON staff_performance_documents
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. staff_performance_history — immutable action audit trail (mission
--    brief §11). Application code only ever INSERTs here, never
--    UPDATEs/DELETEs. metadata is small structured JSON only — never
--    full document content (enforced in lib/performance/history.ts).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_performance_history (
  id                text        PRIMARY KEY,
  case_id           text        NOT NULL,
  document_id       text,
  actor_staff_id    text,
  actor_name        text,
  action            text        NOT NULL,
  document_version  integer,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_staff_perf_history_case') THEN
    ALTER TABLE staff_performance_history
      ADD CONSTRAINT fk_staff_perf_history_case
      FOREIGN KEY (case_id) REFERENCES staff_performance_cases(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_staff_perf_history_document') THEN
    ALTER TABLE staff_performance_history
      ADD CONSTRAINT fk_staff_perf_history_document
      FOREIGN KEY (document_id) REFERENCES staff_performance_documents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_perf_history_case_id      ON staff_performance_history (case_id);
CREATE INDEX IF NOT EXISTS idx_staff_perf_history_document_id  ON staff_performance_history (document_id);
CREATE INDEX IF NOT EXISTS idx_staff_perf_history_action       ON staff_performance_history (action);

ALTER TABLE staff_performance_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE staff_performance_history FROM anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'staff_performance_history' AND policyname = 'service_all_staff_performance_history'
  ) THEN
    CREATE POLICY service_all_staff_performance_history ON staff_performance_history
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 5. Validation
-- ────────────────────────────────────────────────────────────
SELECT
  'staff_performance_pip_v1' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'Staff'
       AND column_name IN ('hire_date','performance_review_exempt','performance_review_exempt_reason','performance_review_exempt_until')) AS staff_columns_added_expect_4,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'staff_performance_cases')     AS cases_table_expect_1,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'staff_performance_documents') AS documents_table_expect_1,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'staff_performance_history')   AS history_table_expect_1,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_staff_perf_documents_case')                AS fk_documents_case_expect_1,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_staff_perf_history_case')                  AS fk_history_case_expect_1,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_staff_perf_history_document')              AS fk_history_document_expect_1,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'staff_performance_cases')                     AS cases_rls_policy_expect_1,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'staff_performance_documents')                 AS documents_rls_policy_expect_1,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'staff_performance_history')                   AS history_rls_policy_expect_1,
  -- HONEST EXPECTATION: zero rows anywhere. No warning is ever auto-created.
  (SELECT COUNT(*) FROM staff_performance_cases)                                                     AS cases_rows_expect_0,
  (SELECT COUNT(*) FROM staff_performance_documents)                                                 AS documents_rows_expect_0,
  (SELECT COUNT(*) FROM staff_performance_history)                                                   AS history_rows_expect_0,
  (SELECT COUNT(*) FROM "Staff" WHERE hire_date IS NOT NULL OR performance_review_exempt = true)     AS staff_rows_touched_expect_0;
-- Expect: staff_performance_pip_v1 | 4 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0
