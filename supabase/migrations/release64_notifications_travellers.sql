-- =============================================================================
-- Release 6.4 Migration: PortalNotification enhancements + TravellerProfile
-- =============================================================================

-- ─── 1. PortalNotification: add new columns ──────────────────────────────────

ALTER TABLE "PortalNotification"
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "category"  TEXT NOT NULL DEFAULT 'ACCOUNT',
  ADD COLUMN IF NOT EXISTS "href"      TEXT;

-- ─── 2. TravellerProfile table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "TravellerProfile" (
  id            TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  relationship  TEXT NOT NULL DEFAULT 'Other',
  "firstName"   TEXT NOT NULL,
  "middleName"  TEXT,
  "lastName"    TEXT NOT NULL,
  "dateOfBirth" TIMESTAMPTZ,
  gender        TEXT,
  nationality   TEXT,
  phone         TEXT,
  email         TEXT,
  "passportMeta" JSONB,
  "isDeleted"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_traveller_profile_user_id ON "TravellerProfile" ("userId");
CREATE INDEX IF NOT EXISTS idx_traveller_profile_deleted  ON "TravellerProfile" ("isDeleted");

-- ─── 3. updatedAt trigger for TravellerProfile ───────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_traveller_profile_updated_at
  BEFORE UPDATE ON "TravellerProfile"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 4. Partial index for active (non-deleted) travellers ────────────────────

CREATE INDEX IF NOT EXISTS idx_traveller_profile_active
  ON "TravellerProfile" ("userId")
  WHERE "isDeleted" = false;
