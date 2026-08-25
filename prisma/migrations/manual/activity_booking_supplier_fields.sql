-- Migration: Add multi-supplier fields to ActivityBooking
-- Run this in the Supabase SQL editor (not prisma db push)
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

ALTER TABLE "ActivityBooking"
  ADD COLUMN IF NOT EXISTS "supplier"           TEXT    NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "supplierProductId"  TEXT,
  ADD COLUMN IF NOT EXISTS "supplierReference"  TEXT,
  ADD COLUMN IF NOT EXISTS "walzReference"      TEXT,
  ADD COLUMN IF NOT EXISTS "bookingSource"      TEXT    NOT NULL DEFAULT 'CUSTOMER_WEB',
  ADD COLUMN IF NOT EXISTS "bookedByStaffId"    TEXT,
  ADD COLUMN IF NOT EXISTS "children"           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "infants"            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "supplierNetAmount"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "markupAmount"       DOUBLE PRECISION;

-- Indexes
CREATE INDEX IF NOT EXISTS "ActivityBooking_supplier_idx"          ON "ActivityBooking" ("supplier");
CREATE INDEX IF NOT EXISTS "ActivityBooking_supplierReference_idx" ON "ActivityBooking" ("supplierReference");
CREATE INDEX IF NOT EXISTS "ActivityBooking_walzReference_idx"     ON "ActivityBooking" ("walzReference");
