-- ── Migration: Email Signature system ──────────────────────────────────────────
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to run multiple times — uses IF NOT EXISTS / INSERT ... ON CONFLICT

-- 1. Add signatureTagline column to Staff table
ALTER TABLE "Staff"
  ADD COLUMN IF NOT EXISTS "signatureTagline" TEXT;

-- 2. Create SignatureSettings singleton table
CREATE TABLE IF NOT EXISTS "SignatureSettings" (
  "id"           TEXT        PRIMARY KEY DEFAULT 'singleton',
  "logoUrl"      TEXT        NOT NULL DEFAULT 'https://www.walztravels.com/walz-logo.png',
  "accentColor"  TEXT        NOT NULL DEFAULT '#C9A84C',
  "brandColor"   TEXT        NOT NULL DEFAULT '#0B1F3A',
  "officeCities" TEXT[]      NOT NULL DEFAULT ARRAY['London', 'Toronto', 'Dubai', 'Lagos', 'Accra'],
  "footerNote"   TEXT        NOT NULL DEFAULT '',
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedBy"    TEXT
);

-- 3. Insert the default singleton row (no-op if it already exists)
INSERT INTO "SignatureSettings" ("id")
VALUES ('singleton')
ON CONFLICT ("id") DO NOTHING;
