-- ============================================================
-- JADE TRAVEL CLUB — RELEASE 2B STRUCTURAL REMEDIATION:
-- AUTHORITATIVE PURCHASE-TO-TERMS PROVENANCE LINK
-- (idempotent, hand-run in the Supabase SQL Editor). NEVER via
-- `prisma db push` / `prisma migrate` — after running, only
-- `npx prisma generate` is needed locally.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is returned
-- for review only, per the standing implementation instruction. Nothing in
-- this migration has been executed by the implementing agent.
--
-- PREREQUISITES (must already be applied, in order):
--   prisma/migrations/jade_travel_club_v1.sql
--   prisma/migrations/jade_travel_club_commercial_v2a.sql
--   prisma/migrations/jade_travel_club_purchase_v2b.sql
--
-- SCOPE
--   adds    1 column: jade_club_membership_terms.purchase_id (nullable)
--   adds    1 unique index/constraint on that column
--   adds    1 foreign key: jade_club_membership_terms.purchase_id ->
--           jade_club_purchases.id
--   alters  0 other columns, drops 0 columns/tables/indexes
--   backfills NOTHING — every existing row's purchase_id stays NULL.
--   touches 0 existing rows' economics/entitlements (ADMIN_GRANT/
--           PROMOTION/DEFAULT-sourced terms rows are historical and are
--           NEVER retroactively linked to a purchase).
--
-- WHY THIS COLUMN EXISTS (structural remediation, post-independent-review)
--   An earlier release of this feature (Release 2B's purchase-activation
--   engine) inferred "did purchase X already create its terms?" from
--   secondary signals (the purchase row's own status/reverse-pointer
--   fields, whether the resulting terms were still unexpired, etc.).
--   Independent review found this class of inference unsound under
--   concurrency. The fix: add ONE direct, authoritative, UNIQUE foreign
--   key from the terms row back to the exact purchase that created it.
--   `jade_club_membership_terms.purchase_id = X` is now the single source
--   of truth for "purchase X's own terms are these" — looked up directly,
--   never inferred from expiry, status, or any other field. See
--   lib/jade-club/entitlements.ts (createMembershipTermsCore) and
--   lib/jade-club/purchase-activation.ts (attemptActivation) for the
--   application-layer read/write sites.
--
-- WHY onDelete = RESTRICT, NOT SET NULL (THE KEY DECISION — READ THIS)
--   jade_club_purchases is a financial/audit record: it is the durable
--   proof of what a member paid, when, and via which provider reference.
--   Once a purchase row has actually created a real membership_terms row
--   (purchase_id populated on that terms row), deleting the purchase row
--   must NEVER be allowed to silently null out that terms row's
--   provenance — a terms row that grants real, currently-active benefits
--   must always be traceable back to the exact payment that authorized
--   it, for as long as that terms row exists. SET NULL would make the
--   purchase row "disposable" once its job is done, which is exactly the
--   property this column exists to prevent.
--
--   RESTRICT is the established precedent for this EXACT situation in
--   this SAME table: jade_club_membership_terms.policy_id already uses
--   `REFERENCES jade_club_commercial_policies(id) ON DELETE RESTRICT`
--   (see jade_travel_club_commercial_v2a.sql) for the identical reason —
--   "traceability ONLY" that a delete must never be allowed to quietly
--   erase. purchase_id follows that exact, already-reviewed precedent.
--   (NO ACTION was also considered — in Postgres, RESTRICT and NO ACTION
--   differ only in whether the check can be deferred to end-of-transaction;
--   this repo's existing convention on this exact table uses RESTRICT, so
--   this migration matches it rather than introducing a second style.)
--
--   In practice, this FK is expected to almost never fire: nothing in
--   this codebase ever deletes a JadeClubPurchase row (there is no
--   DELETE/destroy route for it anywhere in this feature). This
--   constraint exists as the structural backstop against a *future*
--   mistake (an admin cleanup script, a future feature) ever deleting a
--   financially-load-bearing purchase row out from under a live terms
--   period.
--
-- WHY NULLABLE, NOT NOT NULL
--   Every pre-existing jade_club_membership_terms row (ADMIN_GRANT,
--   PROMOTION, DEFAULT sourced) has no originating purchase at all — that
--   is a legitimate, permanent state, not a gap to backfill. NULL means
--   "not purchase-originated." This migration seeds/backfills nothing.
--
-- CONVENTION: snake_case + @map/@@map, matching every other Jade Club
--   migration in this repo.
--
-- ROLLBACK
--   ALTER TABLE jade_club_membership_terms DROP CONSTRAINT IF EXISTS fk_jade_membership_terms_purchase;
--   DROP INDEX IF EXISTS uq_jade_membership_terms_purchase_id;
--   ALTER TABLE jade_club_membership_terms DROP COLUMN IF EXISTS purchase_id;
--   (Safe: no other table references this column; every existing row is
--   NULL in this column, so dropping it loses nothing that predates this
--   migration.)
-- ============================================================

BEGIN;

ALTER TABLE jade_club_membership_terms
  ADD COLUMN IF NOT EXISTS purchase_id text;

-- THE authoritative same-purchase idempotency fact, enforced at the DB
-- layer: one purchase can back AT MOST one membership_terms row
-- (database invariant #1). A partial unique index (WHERE purchase_id IS
-- NOT NULL) is unnecessary here — a plain unique index on a nullable
-- Postgres column already allows any number of NULLs while still
-- enforcing uniqueness among non-NULL values, which is exactly the
-- desired behavior (every historical NULL-purchase_id row is unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS uq_jade_membership_terms_purchase_id
  ON jade_club_membership_terms (purchase_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jade_membership_terms_purchase') THEN
    ALTER TABLE jade_club_membership_terms
      ADD CONSTRAINT fk_jade_membership_terms_purchase
      FOREIGN KEY (purchase_id) REFERENCES jade_club_purchases(id)
      ON DELETE RESTRICT;  -- see header: matches this table's own policy_id precedent — NEVER SET NULL
  END IF;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDATION — run after the migration
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'jade_club_membership_terms' AND column_name = 'purchase_id') AS purchase_id_column_exists,
  (SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_jade_membership_terms_purchase_id')                                       AS unique_index_exists,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'fk_jade_membership_terms_purchase')                                         AS fk_exists,
  (SELECT confdeltype FROM pg_constraint WHERE conname = 'fk_jade_membership_terms_purchase')                                      AS fk_delete_action,  -- Expect: 'r' (RESTRICT)
  (SELECT count(*) FROM jade_club_membership_terms WHERE purchase_id IS NOT NULL)                                                  AS rows_with_purchase_id;  -- Expect: 0 (no backfill)
-- Expect: purchase_id_column_exists = 1, unique_index_exists = 1, fk_exists = 1,
-- fk_delete_action = 'r', rows_with_purchase_id = 0 (this migration seeds/links nothing).
