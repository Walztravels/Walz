-- ============================================================
-- INBOX UX-4.4 — ITINERARY REQUEST columns on "TripRequest"
-- (idempotent, hand-run in the Supabase SQL Editor — NEVER prisma db push;
-- after running, only `npx prisma generate`).
--
-- The Client Action Centre's Itinerary Request action REUSES the existing
-- client-intake pipeline end to end (TripRequest, its public page/API, and
-- the existing admin conversion bridge into Itinerary). These columns are
-- ADDITIVE and NULLABLE: they attach a TripRequest to the Inbox
-- conversation it was generated from, the same way Request Payment,
-- Create Quote and Visa Form already attach their own records — so the
-- Client Action Centre can list "recent itinerary requests for this
-- conversation" and find/link an existing request for a client.
--
-- `expiresAt` additionally closes a real token-hygiene gap the UX-4.4
-- audit found: TripRequest.token previously had NO expiry at all, unlike
-- every other client-facing token in this codebase (VisaApplicationToken,
-- DocumentRequest, Quote's secure token, PaymentLink). This column is
-- populated only for requests generated via the Inbox Action Centre —
-- existing rows (and the pre-existing admin "Invite" mint route, which
-- this feature deliberately does not modify) are unaffected.
--
-- No existing rows or writers (the admin Trip Requests UI, the public
-- /trip-request/[token] page, the existing convert route) change.
-- ============================================================

ALTER TABLE "TripRequest" ADD COLUMN IF NOT EXISTS "conversationId" integer;
ALTER TABLE "TripRequest" ADD COLUMN IF NOT EXISTS "source"         text;
ALTER TABLE "TripRequest" ADD COLUMN IF NOT EXISTS "expiresAt"      timestamptz;

CREATE INDEX IF NOT EXISTS idx_trip_request_conversation
  ON "TripRequest" ("conversationId")
  WHERE "conversationId" IS NOT NULL;

-- ── Validation ───────────────────────────────────────────────
SELECT
  'inbox_ux44' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'TripRequest'
       AND column_name IN ('conversationId','source','expiresAt'))       AS trip_request_columns,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname = 'idx_trip_request_conversation')                  AS idx_trip_request;
-- Expect: inbox_ux44 | 3 | 1
