-- Release 2A: Trip Foundation
-- Run this in the Supabase SQL editor.
-- Extends Trip/TripItem for anonymous sessions, pax fields, TRANSFER type, and quantity.

-- ── 1. Add TRANSFER to TripItemType enum ────────────────────────────────────
ALTER TYPE "TripItemType" ADD VALUE IF NOT EXISTS 'TRANSFER';

-- ── 2. Extend Trip table ─────────────────────────────────────────────────────

-- Make userId nullable (anonymous trips)
ALTER TABLE "Trip" ALTER COLUMN "userId" DROP NOT NULL;

-- Default values for required string fields (allow creation without explicit values)
ALTER TABLE "Trip" ALTER COLUMN "title" SET DEFAULT 'My Trip';
ALTER TABLE "Trip" ALTER COLUMN "destination" SET DEFAULT '';

-- New columns
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "leadId"    TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "origin"    TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "adults"    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "children"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "infants"   INTEGER NOT NULL DEFAULT 0;

-- Update FK constraint to SET NULL instead of CASCADE (now userId can be null)
ALTER TABLE "Trip" DROP CONSTRAINT IF EXISTS "Trip_userId_fkey";
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "Trip_sessionId_idx" ON "Trip"("sessionId");
CREATE INDEX IF NOT EXISTS "Trip_leadId_idx"    ON "Trip"("leadId");

-- ── 3. Extend TripItem table ─────────────────────────────────────────────────
ALTER TABLE "TripItem" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
