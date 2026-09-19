-- ============================================================
-- CLIENT ACTION CENTRE — Quote → Itinerary conversion bridge
-- (idempotent, hand-run in the Supabase SQL Editor — NEVER prisma db push;
--  after running, only `npx prisma generate` is needed locally.)
--
-- Business context: Quote/QuoteItem/QuoteFlightOption/QuoteHotelOption stay
-- the commercial/pricing source of truth. The existing GA0-GA6 Itinerary
-- system (app/itinerary/[ref]/page.tsx + _ProposalPage.tsx, its approval
-- route, lib/proposalHash.ts) stays the ONLY client-facing presentation +
-- acceptance layer for rich multi-service quotes going forward. This
-- migration adds a ONE-WAY, ON-DEMAND conversion bridge (Quote →
-- draft Itinerary) — it does not create any new table, and it does not
-- touch either system's own mechanics.
--
-- Columns, both additive and nullable — no existing rows or writers change:
--
--   quotes."itineraryId"   — set once a Quote has been converted into a
--     draft Itinerary (POST /api/admin/quotes/[id]/convert-to-itinerary),
--     mirroring TripRequest.itineraryId's existing back-reference role for
--     the sibling TripRequest→Itinerary convert route.
--
--   "Itinerary"."quoteId"          — the source Quote, when this Itinerary
--     was created via the conversion bridge (null for every itinerary
--     created any other way, e.g. the TripRequest convert route or the
--     itinerary planner's own "New Itinerary").
--   "Itinerary"."conversationId"   — the Inbox conversation the source
--     Quote was attached to (copied from quotes.conversation_id at convert
--     time), so the Client Action Centre can trace a draft itinerary back
--     to the conversation it came from — mirroring the conversationId
--     column already added to TripRequest (inbox_ux44) and Quote itself
--     (inbox_ux42).
--
-- NAMING: the Prisma Quote model is @@map("quotes") with snake_case column
-- maps (client_name, valid_until, conversation_id, …) — see
-- inbox_ux42_quote_conversation_columns.sql — so the new Quote column
-- follows that table's own convention: "itinerary_id" on table "quotes".
-- The Prisma Itinerary model has NO @@map (table "Itinerary", quoted,
-- case-sensitive) and almost all of its own columns are unmapped camelCase
-- (clientName, clientEmail, …) — see release61_identity_bridge.sql's own
-- comment on this table and TripRequest's own inbox_ux44 columns, which
-- follow the same camelCase-quoted convention on a table with no @@map —
-- so the two new Itinerary columns are "quoteId" and "conversationId"
-- (NOT snake_case).
-- ============================================================

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "itinerary_id" text;

ALTER TABLE "Itinerary" ADD COLUMN IF NOT EXISTS "quoteId"        text;
ALTER TABLE "Itinerary" ADD COLUMN IF NOT EXISTS "conversationId" integer;

-- Partial indexes — only converted rows carry these.
CREATE INDEX IF NOT EXISTS idx_quotes_itinerary
  ON "quotes" ("itinerary_id")
  WHERE "itinerary_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_itinerary_quote
  ON "Itinerary" ("quoteId")
  WHERE "quoteId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_itinerary_conversation
  ON "Itinerary" ("conversationId")
  WHERE "conversationId" IS NOT NULL;

-- ── Validation ───────────────────────────────────────────────
-- Literal 'action_centre_quote_itinerary_bridge' column makes a zero-count visibly a RESULT.
SELECT
  'action_centre_quote_itinerary_bridge' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'quotes' AND column_name = 'itinerary_id')          AS quotes_itinerary_id,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'Itinerary' AND column_name IN ('quoteId','conversationId')) AS itinerary_columns,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE indexname IN ('idx_quotes_itinerary','idx_itinerary_quote','idx_itinerary_conversation')) AS new_indexes,
  (SELECT COUNT(*) FROM information_schema.table_constraints
     WHERE table_name = 'quotes' AND constraint_type = 'PRIMARY KEY')        AS quotes_pk_intact,
  (SELECT COUNT(*) FROM information_schema.table_constraints
     WHERE table_name = 'Itinerary' AND constraint_type = 'PRIMARY KEY')     AS itinerary_pk_intact;
-- Expect: action_centre_quote_itinerary_bridge | 1 | 2 | 3 | 1 | 1
