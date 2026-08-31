-- Release 6.1 — Identity Bridge: user_id column on itinerary table
-- SAFE: additive only — nullable column, no FK constraint, no default value change.
-- Prisma Itinerary model is updated in schema.prisma to reflect this column.
-- DO NOT run prisma db push. Apply via Supabase SQL editor only.
--
-- Rollback: supabase/migrations/release61_identity_bridge_rollback.sql

ALTER TABLE itinerary ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Index for portal ownership lookups (WHERE user_id = $1)
CREATE INDEX IF NOT EXISTS idx_itinerary_user_id
  ON itinerary(user_id)
  WHERE user_id IS NOT NULL;

-- Index for email-based backfill matching (JOIN on lower(client_email))
CREATE INDEX IF NOT EXISTS idx_itinerary_client_email_lower
  ON itinerary(lower(client_email));
