-- =============================================================================
-- SUPPLIER OUTREACH MIGRATION
-- Run in Supabase SQL Editor
-- =============================================================================

-- Add email field to Supplier
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "email" TEXT;

-- SupplierMessage log
CREATE TABLE IF NOT EXISTS "SupplierMessage" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "supplierId" TEXT NOT NULL REFERENCES "Supplier"("id") ON DELETE CASCADE,
  "bookingId"  TEXT,
  "sentBy"     TEXT NOT NULL,
  "subject"    TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "purpose"    TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'sent',
  "sentAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "repliedAt"  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "SupplierMessage_supplierId_idx" ON "SupplierMessage" ("supplierId");
CREATE INDEX IF NOT EXISTS "SupplierMessage_bookingId_idx"  ON "SupplierMessage" ("bookingId");

-- One-time: copy contact into email where it looks like a valid email
UPDATE "Supplier"
SET    "email" = "contact"
WHERE  "email" IS NULL
  AND  "contact" IS NOT NULL
  AND  "contact" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
