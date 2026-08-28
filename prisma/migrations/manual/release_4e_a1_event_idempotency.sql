-- Release 4E-A.1 — Commercial Event Idempotency
-- Supabase SQL Editor: run this ONCE in production.
--
-- ── Step 1: Audit for existing duplicates ────────────────────────────────────
-- Run this query BEFORE Step 2 and review results.
-- If duplicates exist, DO NOT proceed to Step 2 without reviewing them.
--
-- SELECT "eventId", COUNT(*) as cnt,
--        array_agg(id) as record_ids,
--        array_agg(event) as event_names,
--        array_agg("createdAt" ORDER BY "createdAt") as created_at_values,
--        array_agg("leadId") as lead_ids
-- FROM "CommercialEvent"
-- WHERE "eventId" IS NOT NULL
-- GROUP BY "eventId"
-- HAVING COUNT(*) > 1
-- ORDER BY cnt DESC;
--
-- Expected result: 0 rows. If rows are returned, investigate each one before
-- proceeding. Do NOT blindly delete — a cross_sell_purchased duplicate is
-- idempotent but a jade_checkout_converted duplicate could indicate double-payment.
-- Document any removed rows with event name, eventId, IDs, and reason.

-- ── Step 2: Create the partial unique index ───────────────────────────────────
-- Partial index: NULL eventIds are explicitly excluded so NULL rows can coexist
-- (behavioral events such as jade_started fire without an eventId and intentionally
-- represent multiple distinct occurrences). Only non-null eventIds are unique.
--
-- This replaces the application-level dedup race condition with a DB-enforced
-- unique constraint that cannot be raced by concurrent webhook deliveries.
--
-- A duplicate insert will throw a unique violation (Prisma error code P2002).
-- Application code must treat P2002 on CommercialEvent as a safe no-op when
-- an eventId was supplied — the first insert succeeded and the second is a retry.

CREATE UNIQUE INDEX IF NOT EXISTS "CommercialEvent_eventId_unique"
ON "CommercialEvent" ("eventId")
WHERE "eventId" IS NOT NULL;

-- ── Why a partial index rather than @unique in Prisma schema ─────────────────
-- A Prisma @@unique([eventId]) would generate an unrestricted UNIQUE constraint,
-- meaning only ONE NULL eventId would be allowed per table. That breaks all
-- behavioral events which intentionally have eventId = NULL. PostgreSQL partial
-- indexes (WHERE condition) allow unlimited NULLs while enforcing uniqueness
-- for non-null values. Prisma schema cannot represent partial unique indexes —
-- the index is manually managed here and in the DB. The Prisma schema keeps
-- @@index([eventId]) for query performance; the DB partial unique index enforces
-- idempotency. Both coexist safely: PostgreSQL uses the unique partial index
-- for constraint enforcement and may use either for query planning.
