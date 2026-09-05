-- Do-Not-Book hard-block flag on ClientRiskScore + flag the HA8H86 client.
-- Run ONCE in the Supabase SQL editor. Idempotent — safe to re-run.
-- (Schema changes go through the SQL editor, not prisma db push.)

-- ── 1. Add the hard-block columns (distinct from flaggedForReview) ────────────
ALTER TABLE "ClientRiskScore"
  ADD COLUMN IF NOT EXISTS "doNotBook"       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "doNotBookReason" text,
  ADD COLUMN IF NOT EXISTS "doNotBookSetBy"  text,
  ADD COLUMN IF NOT EXISTS "doNotBookSetAt"  timestamptz;

-- ── 2. Identify the client tied to reference HA8H86 ──────────────────────────
-- Resolved via the itinerary's linked account (userId), falling back to the
-- account matching the itinerary's clientEmail — never by name or phone.
-- Verify first (expect exactly ONE row):
SELECT i."referenceNumber", i."clientName", i."clientEmail", i.user_id,
       u.id AS resolved_user_id, u.email AS resolved_email
FROM "Itinerary" i
LEFT JOIN "User" u
  ON u.id = i.user_id
  OR (i.user_id IS NULL AND lower(u.email) = lower(i."clientEmail"))
WHERE i."referenceNumber" = 'WALZ-HA8H86';

-- ── 3. Set the flag (upserts the risk score row if the client has none) ──────
WITH target AS (
  SELECT u.id AS resolved_id
  FROM "Itinerary" i
  JOIN "User" u
    ON u.id = i.user_id
    OR (i.user_id IS NULL AND lower(u.email) = lower(i."clientEmail"))
  WHERE i."referenceNumber" = 'WALZ-HA8H86'
  LIMIT 1
)
INSERT INTO "ClientRiskScore" (
  id, "userId", "doNotBook", "doNotBookReason", "doNotBookSetBy", "doNotBookSetAt",
  "computedAt", "updatedAt"
)
SELECT
  'crs_' || substr(md5(random()::text || clock_timestamp()::text), 1, 21),
  target.resolved_id,
  true,
  'Repeated conduct issues toward staff; disputed a signed, accepted proposal. See internal records dated 30 Aug – 4 Sep 2026.',
  'contact@walztravels.com (Super Admin)',
  now(),
  now(), now()
FROM target
ON CONFLICT ("userId") DO UPDATE SET
  "doNotBook"       = true,
  "doNotBookReason" = EXCLUDED."doNotBookReason",
  "doNotBookSetBy"  = EXCLUDED."doNotBookSetBy",
  "doNotBookSetAt"  = now(),
  "updatedAt"       = now();

-- ── 4. Confirm ────────────────────────────────────────────────────────────────
SELECT r."userId", u.email, r."doNotBook", r."doNotBookReason",
       r."doNotBookSetBy", r."doNotBookSetAt", r."flaggedForReview"
FROM "ClientRiskScore" r
JOIN "User" u ON u.id = r."userId"
WHERE r."doNotBook" = true;
