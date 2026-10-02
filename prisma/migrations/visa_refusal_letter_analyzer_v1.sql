-- ============================================================
-- VISA REFUSAL LETTER ANALYZER — V1: persistence columns
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- `prisma db push` / `prisma migrate` — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is returned
-- for review only, per the standing implementation instruction. Nothing in
-- this migration has been executed by the implementing agent against any
-- production or real Supabase database.
--
-- PREREQUISITE: none — "VisaApplication" already exists (it is the core
-- visa-application table created long before this feature).
--
-- SCOPE
--   adds    3 NULLABLE columns (no default, no NOT NULL) to the EXISTING,
--           pre-existing, quoted-CamelCase "VisaApplication" table:
--             "VisaApplication"."refusalLetterAnalysis"       jsonb
--             "VisaApplication"."refusalLetterAnalyzedAt"     timestamptz
--             "VisaApplication"."refusalLetterUploadedBy"     text
--   creates 0 new tables, 0 new relations/foreign keys.
--   alters  0 other tables, drops 0 columns/tables/indexes.
--   backfill: NONE. Every new column is NULLABLE with no default, so
--           `ADD COLUMN IF NOT EXISTS` touches zero bytes of any existing
--           row's existing columns — every pre-existing row simply gains
--           three new NULL-valued columns. No UPDATE statement appears
--           anywhere in this migration.
--
-- WHY THIS COLUMN NAMING/CASING, NOT snake_case
--   The "VisaApplication" Prisma model has ZERO @map/@@map directives
--   anywhere in prisma/schema.prisma (verified by grepping the full model
--   body). Prisma therefore default-maps it to the literal, case-sensitive,
--   QUOTED table name "VisaApplication", and every column is the literal
--   camelCase field name, also quoted (e.g. "userId", "referenceNumber").
--   This is confirmed by multiple existing precedents that already read/
--   write this exact table with quoted camelCase SQL: app/api/admin/
--   migrate/route.ts, app/api/cron/birthdays/route.ts, prisma/migrations/
--   walz_business_r1_foundation.sql, prisma/migrations/
--   whatsapp_broadcast_v1_1_audience.sql, prisma/walz_schema.sql, and this
--   migration's own sibling "VisaCaseDocument"."scanStatus" column added by
--   prisma/migrations/walz_business_r2_1.sql (Section 6 of that file, which
--   documents the identical CamelCase-preservation rationale). This is
--   DIFFERENT from the separate Walz Business feature's own tables (which
--   use @@map/@map to snake_case) — these three new columns are
--   deliberately NOT snake_cased, to match "VisaApplication"'s own existing
--   convention rather than introducing a mismatched casing scheme on an
--   already-CamelCase table.
--
-- WHY THESE THREE COLUMNS
--   lib/analyzeRefusalLetter.ts's saveRefusalLetterAnalysis() /
--   getRefusalLetterAnalysis() already read/write these three exact column
--   names today via tryDb()-wrapped raw SQL, and already degrade
--   gracefully (catch + return false/null, never throw to the caller) when
--   the columns do not exist yet — i.e. the analyzer has been fully
--   functional with ZERO persistence since it shipped, and will begin
--   persisting automatically, with no code change required, the moment
--   this migration is applied:
--     "refusalLetterAnalysis"      jsonb      — the full enforced
--         RefusalLetterAnalysis result object (post invariant-enforcement,
--         i.e. already classification/checklist/disclaimer-safe — never
--         the raw, unvalidated model output).
--     "refusalLetterAnalyzedAt"    timestamptz — set to NOW() at save time.
--     "refusalLetterUploadedBy"    text        — the staff admin session
--         email that triggered the analysis (audit attribution).
--
-- RE-ANALYSIS BEHAVIOR (explicit decision — see also the code comment on
--   saveRefusalLetterAnalysis() in lib/analyzeRefusalLetter.ts and the
--   accompanying test in __tests__/refusal-letter-analyzer-persistence.
--   test.ts): single-slot, OVERWRITE. Re-running the analyzer against the
--   same VisaApplication replaces the prior "refusalLetterAnalysis" /
--   "refusalLetterAnalyzedAt" / "refusalLetterUploadedBy" values via a
--   plain UPDATE — there is no history table and no versioning. This
--   mirrors the simplest existing precedent available (the Bank Statement
--   Analyzer, lib/analyzeBankStatement.ts, has NO persistence of its own at
--   all to follow — it returns its result for the current request only),
--   so "simple overwrite, single slot" was chosen as the safer, simpler
--   default per the task's own instruction, rather than inventing a new
--   versioning scheme for a staff-only, non-legal-conclusion classification
--   aid.
--
-- NOT BUILT HERE (out of scope for this migration)
--   - No history/versioning table for prior analyses.
--   - No index on any of the three new columns — this table is read by
--     primary key (id) in every call site (saveRefusalLetterAnalysis /
--     getRefusalLetterAnalysis both filter on `WHERE id = $1`), so no new
--     index is needed for this feature's access pattern.
--   - No RLS change — "VisaApplication" is read/written exclusively via the
--     application's own Prisma/service-role connection, as it already is
--     for every other column on this table; this migration does not alter
--     that model.
--
-- ROLLBACK
--   ALTER TABLE "VisaApplication" DROP COLUMN IF EXISTS "refusalLetterUploadedBy";
--   ALTER TABLE "VisaApplication" DROP COLUMN IF EXISTS "refusalLetterAnalyzedAt";
--   ALTER TABLE "VisaApplication" DROP COLUMN IF EXISTS "refusalLetterAnalysis";
--   (Safe: nothing outside the Visa Refusal Letter Analyzer feature
--   — lib/analyzeRefusalLetter.ts and app/api/admin/intelligence/
--   refusal-letter/route.ts — reads or writes any of these three columns.
--   After rollback, saveRefusalLetterAnalysis()/getRefusalLetterAnalysis()
--   simply resume their pre-migration graceful-degradation behavior
--   (return false/null, never throw) with zero code change required.)
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. "VisaApplication"."refusalLetterAnalysis" — additive, NULLABLE jsonb.
--    No default, no NOT NULL, no backfill: every pre-existing row simply
--    gains this column with value NULL.
-- ────────────────────────────────────────────────────────────
ALTER TABLE "VisaApplication"
  ADD COLUMN IF NOT EXISTS "refusalLetterAnalysis" jsonb;

-- ────────────────────────────────────────────────────────────
-- 2. "VisaApplication"."refusalLetterAnalyzedAt" — additive, NULLABLE
--    timestamptz. No default, no NOT NULL, no backfill.
-- ────────────────────────────────────────────────────────────
ALTER TABLE "VisaApplication"
  ADD COLUMN IF NOT EXISTS "refusalLetterAnalyzedAt" timestamptz;

-- ────────────────────────────────────────────────────────────
-- 3. "VisaApplication"."refusalLetterUploadedBy" — additive, NULLABLE
--    text. No default, no NOT NULL, no backfill.
-- ────────────────────────────────────────────────────────────
ALTER TABLE "VisaApplication"
  ADD COLUMN IF NOT EXISTS "refusalLetterUploadedBy" text;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDATION — run after the migration
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'VisaApplication' AND column_name = 'refusalLetterAnalysis')      AS analysis_column_exists,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'VisaApplication' AND column_name = 'refusalLetterAnalyzedAt')    AS analyzed_at_column_exists,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'VisaApplication' AND column_name = 'refusalLetterUploadedBy')    AS uploaded_by_column_exists,
  (SELECT count(*) FROM "VisaApplication" WHERE "refusalLetterAnalysis" IS NOT NULL)                                                    AS non_null_analysis_rows; -- Expect: 0 immediately after this migration (no backfill)
-- Expect: all three *_column_exists = 1, non_null_analysis_rows = 0.
-- To re-confirm zero unintended mutation of anything else, diff
-- `SELECT id, status, "referenceNumber", "destinationIso2", "updatedAt"
-- FROM "VisaApplication" ORDER BY "createdAt"` against a pre-migration
-- snapshot — it should be byte-identical (note: "updatedAt" is a Prisma
-- @updatedAt column and is NOT touched by this migration, since this
-- migration issues no UPDATE of any kind).
