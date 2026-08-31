-- =============================================================================
-- Release 6.4 Rollback: Reverse PortalNotification enhancements + TravellerProfile
-- =============================================================================

-- ─── 1. Drop TravellerProfile (CASCADE removes indexes and trigger) ───────────

DROP TABLE IF EXISTS "TravellerProfile" CASCADE;

-- ─── 2. PortalNotification: remove added columns ─────────────────────────────

ALTER TABLE "PortalNotification"
  DROP COLUMN IF EXISTS "dedupeKey",
  DROP COLUMN IF EXISTS "category",
  DROP COLUMN IF EXISTS "href";
