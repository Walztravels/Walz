-- ============================================================
-- INBOX-0S.4A — "Lead" DUPLICATE CLEANUP + UNIQUE (source, sourceId)
-- Hand-run in Supabase SQL Editor. Single transaction, auditable,
-- safe to re-run after success (it will NOTICE 'already cleaned'
-- and only re-assert the unique index, which is IF NOT EXISTS).
--
-- Scope: exactly ONE duplicate pair in the Prisma "Lead" table:
--   source   = 'whatsapp-jade'
--   sourceId = 'jade-wa-+233554324622'
--   CANONICAL (kept):    id 'cmsxwz0l40000ru10nemurh3a'  (createdAt 2026-08-18T00:18:00.760, earlier)
--   DUPLICATE (deleted): id 'cmsxwz0s80001ru1058o1xxpv'  (createdAt 2026-08-18T00:18:01.016, race artifact)
-- The duplicate carries a RICHER lastMessage, so its data is
-- consolidated into the canonical row BEFORE deletion.
--
-- This script touches ONLY the Prisma "Lead" table. It does NOT
-- touch the Supabase 'leads' table or the 'messages' table.
--
-- NOTE: production "Lead" does NOT have the column
-- "lastOfflineNotifiedAt" (schema.prisma declares it but it was
-- never migrated). Every statement below names columns explicitly
-- and never references it, so this script runs against the real
-- production shape.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ROLLBACK PLAN (read BEFORE running — all of this is commented
-- out and NOT executable).
--
-- 1) BEFORE running the migration, capture a full-column snapshot
--    of BOTH rows and save the output somewhere durable (a text
--    file / ticket). to_jsonb(l) serialises every column that
--    actually exists in the DB, so nothing is missed:
--
--    -- SELECT l.id, to_jsonb(l) AS row_snapshot
--    -- FROM "Lead" l
--    -- WHERE l.id IN ('cmsxwz0l40000ru10nemurh3a', 'cmsxwz0s80001ru1058o1xxpv');
--
-- 2) To RESTORE after the migration has committed:
--    a) Drop the uniqueness guarantee first (otherwise the
--       re-insert of the duplicate will be rejected):
--
--    -- DROP INDEX IF EXISTS "Lead_source_sourceId_key";
--
--    b) Re-insert the deleted duplicate row from the snapshot
--       taken in step 1, e.g. with jsonb_populate_record:
--
--    -- INSERT INTO "Lead"
--    -- SELECT * FROM jsonb_populate_record(NULL::"Lead",
--    --   '<paste the duplicate row_snapshot JSON here>'::jsonb);
--
--    c) The consolidation UPDATE on the canonical row can be
--       reversed the same way: the canonical row's pre-migration
--       snapshot from step 1 contains every original value —
--       UPDATE the canonical row column-by-column from that JSON
--       (or jsonb_populate_record into a temp row and copy over).
--
-- 3) If the transaction below ABORTS (any RAISE EXCEPTION), no
--    rollback is needed: nothing was written.
-- ────────────────────────────────────────────────────────────

BEGIN;
SET LOCAL search_path = public;   -- defense-in-depth for a hand-run script (review L1)

-- ============================================================
-- STEPS 1–4 — guarded, all-or-nothing, inside one DO block.
--   Step 1: lock the pair and verify it exists exactly as expected
--           (or NOTICE 'already cleaned' and skip on a re-run).
--   Step 2: re-verify zero references in all 11 Lead-referencing
--           tables (abort naming the table otherwise).
--   Step 3: consolidate duplicate data into the canonical row.
--   Step 4: delete the duplicate and verify exactly 1 row deleted.
-- ============================================================
DO $$
DECLARE
  v_canonical_id  CONSTANT text := 'cmsxwz0l40000ru10nemurh3a';
  v_duplicate_id  CONSTANT text := 'cmsxwz0s80001ru1058o1xxpv';
  v_source        CONSTANT text := 'whatsapp-jade';
  v_source_id     CONSTANT text := 'jade-wa-+233554324622';

  v_canonical_ok  boolean;
  v_duplicate_ok  boolean;
  v_snapshot      record;
  v_index_ok      boolean;
  v_locked        int;
  v_ref_count     bigint;
  v_deleted       int;
  v_tbl           text;
  v_col           text;
  -- All 11 verified Lead-referencing tables (table, column):
  v_ref_tables    CONSTANT text[] := ARRAY[
    'Booking',                  'Trip',
    'quotes',                   'RevenueOpportunity',
    'ConversationIntelligence', 'card_authorizations',
    'CommercialEvent',          'CartSession',
    'RecoveryOpportunity',      'AutomationAuditLog',
    'FamilyGroup'
  ];
  v_ref_columns   CONSTANT text[] := ARRAY[
    'leadId',                   'leadId',
    'lead_id',                  'leadId',
    'leadId',                   'leadId',
    'leadId',                   'leadId',
    'leadId',                   'leadId',
    'leadApplicantId'
  ];
BEGIN
  -- ── STEP 1a: re-run detection (clean skip) ────────────────
  SELECT EXISTS (SELECT 1 FROM "Lead" WHERE id = v_canonical_id
                   AND source = v_source AND "sourceId" = v_source_id)
    INTO v_canonical_ok;
  SELECT EXISTS (SELECT 1 FROM "Lead" WHERE id = v_duplicate_id)
    INTO v_duplicate_ok;
  SELECT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'public'
                   AND indexname = 'Lead_source_sourceId_key')
    INTO v_index_ok;

  IF NOT v_duplicate_ok AND v_canonical_ok AND v_index_ok THEN
    RAISE NOTICE 'INBOX-0S.4A: already cleaned — duplicate % is gone, canonical % intact, unique index present. Nothing to do.',
      v_duplicate_id, v_canonical_id;
    RETURN;  -- skip the transaction body; index re-assert below is a no-op
  END IF;

  IF NOT v_duplicate_ok AND v_canonical_ok AND NOT v_index_ok THEN
    RAISE NOTICE 'INBOX-0S.4A: duplicate already deleted but unique index missing — skipping data steps; the index will be created below.';
    RETURN;
  END IF;

  -- ── STEP 1b: unexpected-state guards ──────────────────────
  IF NOT v_canonical_ok THEN
    RAISE EXCEPTION 'INBOX-0S.4A ABORT: canonical row % with source=% / sourceId=% not found. UNEXPECTED STATE — investigate before re-running; do not proceed.',
      v_canonical_id, v_source, v_source_id;
  END IF;

  -- Duplicate exists (v_duplicate_ok is true here); verify it is
  -- really the expected pair member, not some other row reusing the id.
  IF NOT EXISTS (SELECT 1 FROM "Lead" WHERE id = v_duplicate_id
                   AND source = v_source AND "sourceId" = v_source_id) THEN
    RAISE EXCEPTION 'INBOX-0S.4A ABORT: row % exists but its source/sourceId no longer match (% / %). UNEXPECTED STATE — investigate before re-running.',
      v_duplicate_id, v_source, v_source_id;
  END IF;

  -- ── STEP 1c: lock both rows for the rest of the transaction ─
  SELECT count(*) INTO v_locked
  FROM (
    SELECT id FROM "Lead"
    WHERE id IN (v_canonical_id, v_duplicate_id)
      AND source = v_source AND "sourceId" = v_source_id
    FOR UPDATE
  ) locked;

  IF v_locked <> 2 THEN
    RAISE EXCEPTION 'INBOX-0S.4A ABORT: expected to lock exactly 2 rows, locked %. UNEXPECTED STATE (concurrent change?) — investigate.', v_locked;
  END IF;

  -- ── STEP 1b: MANDATORY pre-change snapshot (review M2) ─────
  -- Both rows are emitted into the SQL editor output as NOTICEs so the
  -- rollback plan's inputs are captured in the same run, every run.
  FOR v_snapshot IN
    SELECT to_jsonb(l)::text AS row_json FROM "Lead" l
    WHERE l.id IN (v_canonical_id, v_duplicate_id)
  LOOP
    RAISE NOTICE 'INBOX-0S.4A SNAPSHOT: %', v_snapshot.row_json;
  END LOOP;

  -- ── STEP 1c: pipeline fields must MATCH or a human decides ─
  -- The audit found status/service/branch identical. If any of them has
  -- since diverged, silent canonical-wins would discard pipeline state —
  -- abort and require an explicit decision instead (review M2).
  IF EXISTS (
    SELECT 1 FROM "Lead" c, "Lead" d
    WHERE c.id = v_canonical_id AND d.id = v_duplicate_id
      AND (c.status  IS DISTINCT FROM d.status
        OR c.service IS DISTINCT FROM d.service
        OR c.branch  IS DISTINCT FROM d.branch)
  ) THEN
    RAISE EXCEPTION 'INBOX-0S.4A ABORT: status/service/branch differ between the two rows — review the SNAPSHOT notices above and decide the merge explicitly. Nothing was changed.';
  END IF;

  -- ── STEP 2: re-verify ZERO references to the duplicate id ──
  -- (audit said zero; re-check inside the transaction anyway and
  -- abort naming the offending table rather than orphan anything)
  FOR i IN 1 .. array_length(v_ref_tables, 1) LOOP
    v_tbl := v_ref_tables[i];
    v_col := v_ref_columns[i];
    EXECUTE format('SELECT count(*) FROM %I WHERE %I = $1', v_tbl, v_col)
      INTO v_ref_count USING v_duplicate_id;
    IF v_ref_count > 0 THEN
      RAISE EXCEPTION 'INBOX-0S.4A ABORT: table %.% has % row(s) referencing duplicate lead % — references must be repointed before deletion. Nothing was changed.',
        v_tbl, v_col, v_ref_count, v_duplicate_id;
    END IF;
  END LOOP;

  -- ── STEP 3: consolidate duplicate → canonical ─────────────
  -- Rules: never overwrite meaningful canonical data with null/empty.
  --  * createdAt = earliest, updatedAt = latest of the pair.
  --  * lastMessage follows the latest lastMessageAt (>= means the
  --    duplicate's richer message wins the 256 ms race).
  --  * nullable scalars: COALESCE(canonical, duplicate).
  --  * "latest wins" timestamps: GREATEST (ignores NULLs).
  --  * nextFollowUpAt: LEAST (soonest follow-up wins; ignores NULLs).
  --  * booleans: jadeAssisted / marketingOptOut = OR;
  --    isRead / jadeActive = AND (unread if either unread; if either
  --    side deliberately disabled Jade, stay disabled).
  --  * conversation: canonical array || duplicate entries not already
  --    contained in it (jsonb containment check per element).
  UPDATE "Lead" c
  SET
    "createdAt"     = LEAST(c."createdAt", d."createdAt"),
    "updatedAt"     = GREATEST(c."updatedAt", d."updatedAt"),

    "lastMessage"   = CASE
                        WHEN d."lastMessageAt" IS NOT NULL
                         AND (c."lastMessageAt" IS NULL OR d."lastMessageAt" >= c."lastMessageAt")
                        THEN COALESCE(d."lastMessage", c."lastMessage")
                        ELSE COALESCE(c."lastMessage", d."lastMessage")
                      END,
    "lastMessageAt" = GREATEST(c."lastMessageAt", d."lastMessageAt"),

    -- name: keep canonical's unless empty/blank, then duplicate's
    name            = CASE WHEN NULLIF(btrim(c.name), '') IS NULL THEN d.name ELSE c.name END,

    -- nullable scalars: canonical wins when present
    email               = COALESCE(c.email,               d.email),
    whatsapp            = COALESCE(c.whatsapp,            d.whatsapp),
    destination         = COALESCE(c.destination,         d.destination),
    "travelDate"        = COALESCE(c."travelDate",        d."travelDate"),
    details             = COALESCE(c.details,             d.details),
    "instagramUsername" = COALESCE(c."instagramUsername", d."instagramUsername"),
    "assignedTo"        = COALESCE(c."assignedTo",        d."assignedTo"),
    "assignedToId"      = COALESCE(c."assignedToId",      d."assignedToId"),
    platform            = COALESCE(c.platform,            d.platform),
    "importBatchId"     = COALESCE(c."importBatchId",     d."importBatchId"),
    "followUpNote"      = COALESCE(c."followUpNote",      d."followUpNote"),
    "interestLevel"     = COALESCE(c."interestLevel",     d."interestLevel"),
    "dateOfBirth"       = COALESCE(c."dateOfBirth",       d."dateOfBirth"),

    -- "latest wins" timestamps (GREATEST ignores NULLs in Postgres)
    "jadeSilencedAt"      = GREATEST(c."jadeSilencedAt",      d."jadeSilencedAt"),
    "jadeResumedAt"       = GREATEST(c."jadeResumedAt",       d."jadeResumedAt"),
    "jadeQualifiedAt"     = GREATEST(c."jadeQualifiedAt",     d."jadeQualifiedAt"),
    "lastContactedAt"     = GREATEST(c."lastContactedAt",     d."lastContactedAt"),
    "birthdayEmailSentAt" = GREATEST(c."birthdayEmailSentAt", d."birthdayEmailSentAt"),

    -- soonest follow-up wins (LEAST ignores NULLs)
    "nextFollowUpAt" = LEAST(c."nextFollowUpAt", d."nextFollowUpAt"),

    "followUpCount"   = GREATEST(c."followUpCount", d."followUpCount"),
    "jadeAssisted"    = (c."jadeAssisted"    OR  d."jadeAssisted"),
    "marketingOptOut" = (c."marketingOptOut" OR  d."marketingOptOut"),
    "isRead"          = (c."isRead"          AND d."isRead"),
    "jadeActive"      = (c."jadeActive"      AND d."jadeActive"),

    -- conversation: append duplicate's entries not already present;
    -- result stays a jsonb array. If either side is unexpectedly not
    -- an array, keep canonical's value untouched.
    conversation = CASE
      WHEN jsonb_typeof(c.conversation) = 'array'
       AND jsonb_typeof(d.conversation) = 'array'
      THEN COALESCE(
             -- merge then re-sort chronologically so Jade's context stays
             -- ordered (review M3); entries without a timestamp sort last
             (SELECT jsonb_agg(elem ORDER BY COALESCE(elem->>'timestamp', '9999'))
              FROM (
                SELECT elem FROM jsonb_array_elements(c.conversation) AS elem
                UNION ALL
                SELECT elem FROM jsonb_array_elements(d.conversation) AS elem
                WHERE NOT (c.conversation @> jsonb_build_array(elem))
              ) merged(elem)),
             '[]'::jsonb)
      ELSE c.conversation
    END
  FROM "Lead" d
  WHERE c.id = v_canonical_id
    AND d.id = v_duplicate_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;  -- reused var; this is the UPDATE count
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'INBOX-0S.4A ABORT: consolidation UPDATE touched % row(s), expected exactly 1. Rolling back.', v_deleted;
  END IF;

  -- ── STEP 4: delete ONLY the duplicate, verify exactly 1 row ─
  DELETE FROM "Lead"
  WHERE id = v_duplicate_id
    AND source = v_source AND "sourceId" = v_source_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'INBOX-0S.4A ABORT: DELETE affected % row(s), expected exactly 1. Rolling back.', v_deleted;
  END IF;

  RAISE NOTICE 'INBOX-0S.4A: consolidated into % and deleted duplicate %.', v_canonical_id, v_duplicate_id;
END $$;

-- ============================================================
-- STEP 5 — uniqueness guarantee, so this race can never recur.
-- Exactly the Prisma-conventional name for @@unique([source, sourceId])
-- now declared in schema.prisma. NOTE: Postgres treats NULLs as
-- DISTINCT in unique indexes, so the many rows with NULL "sourceId"
-- (homepage/CSV leads etc.) are unaffected — only rows with a
-- non-null (source, sourceId) pair are deduplicated going forward.
-- ============================================================
-- ── Schema-drift repair (review H2 root cause) ───────────────
-- schema.prisma declares "lastOfflineNotifiedAt" but production lacks it;
-- every unselected Prisma Lead read/create has thrown P2022 since Aug 28
-- (Jade save_lead failures in the Vercel logs). Additive and idempotent.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastOfflineNotifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Lead_source_sourceId_key"
  ON "Lead" ("source", "sourceId");

COMMIT;

-- ============================================================
-- STEP 6 — VALIDATION (read-only; run after COMMIT above).
-- Expect one row:
--   canonical_exists      = 1
--   duplicate_remaining   = 0
--   unique_index_exists   = 1
--   remaining_dup_groups  = 0
-- plus the canonical row's consolidated lastMessage excerpt and
-- createdAt/updatedAt for the audit record.
-- ============================================================
SELECT
  (SELECT count(*) FROM "Lead" WHERE id = 'cmsxwz0l40000ru10nemurh3a')                  AS canonical_exists,
  (SELECT count(*) FROM "Lead" WHERE id = 'cmsxwz0s80001ru1058o1xxpv')                  AS duplicate_remaining,
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'Lead_source_sourceId_key')            AS unique_index_exists,
  (SELECT count(*) FROM (
     SELECT 1 FROM "Lead"
     WHERE "sourceId" IS NOT NULL
     GROUP BY source, "sourceId"
     HAVING count(*) > 1
   ) dupes)                                                                             AS remaining_dup_groups,
  (SELECT left("lastMessage", 120) FROM "Lead" WHERE id = 'cmsxwz0l40000ru10nemurh3a')  AS canonical_last_message_excerpt,
  (SELECT "lastMessageAt" FROM "Lead" WHERE id = 'cmsxwz0l40000ru10nemurh3a')           AS canonical_last_message_at,
  (SELECT "createdAt" FROM "Lead" WHERE id = 'cmsxwz0l40000ru10nemurh3a')               AS canonical_created_at,
  (SELECT "updatedAt" FROM "Lead" WHERE id = 'cmsxwz0l40000ru10nemurh3a')               AS canonical_updated_at;
