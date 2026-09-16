-- ══════════════════════════════════════════════════════════════════════════
-- DI-2 — Document Intelligence evidence engine.
-- Idempotent; ADDITIVE plus one relaxation (applicationId becomes nullable
-- so unlinked uploads stop storing the literal string 'manual').
-- Run manually in the Supabase SQL editor. No data is deleted.
-- ══════════════════════════════════════════════════════════════════════════

-- 1. DocumentAuthenticityCheck: allow NULL applicationId + link to the
--    stored source document. Backfill legacy 'manual' rows to NULL.
ALTER TABLE "DocumentAuthenticityCheck" ALTER COLUMN "applicationId" DROP NOT NULL;
ALTER TABLE "DocumentAuthenticityCheck" ADD COLUMN IF NOT EXISTS "documentId" TEXT;
UPDATE "DocumentAuthenticityCheck" SET "applicationId" = NULL WHERE "applicationId" = 'manual';

-- 2. Private document retention.
CREATE TABLE IF NOT EXISTS "VisaCaseDocument" (
  "id"            TEXT PRIMARY KEY,
  "applicationId" TEXT,
  "bucket"        TEXT NOT NULL DEFAULT 'visa-documents',
  "storagePath"   TEXT NOT NULL,
  "documentType"  TEXT NOT NULL,
  "fileName"      TEXT NOT NULL,
  "mimeType"      TEXT,
  "fileSize"      INTEGER,
  "checksum"      TEXT,
  "uploadedBy"    TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VisaCaseDocument_applicationId_idx" ON "VisaCaseDocument"("applicationId");
CREATE INDEX IF NOT EXISTS "VisaCaseDocument_checksum_idx"      ON "VisaCaseDocument"("checksum");

-- 3. Source-attributed evidence values.
CREATE TABLE IF NOT EXISTS "VisaCaseEvidence" (
  "id"               TEXT PRIMARY KEY,
  "applicationId"    TEXT NOT NULL,
  "sourceType"       TEXT NOT NULL,
  "sourceId"         TEXT,
  "documentType"     TEXT,
  "field"            TEXT NOT NULL,
  "rawValue"         TEXT,
  "normalizedValue"  TEXT,
  "dataType"         TEXT NOT NULL DEFAULT 'string',
  "currency"         TEXT,
  "confidence"       DOUBLE PRECISION NOT NULL DEFAULT 1,
  "extractionMethod" TEXT,
  "extractorVersion" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VisaCaseEvidence_applicationId_field_idx" ON "VisaCaseEvidence"("applicationId", "field");
CREATE INDEX IF NOT EXISTS "VisaCaseEvidence_sourceType_sourceId_idx" ON "VisaCaseEvidence"("sourceType", "sourceId");

-- Verification
SELECT 'VERIFY VisaCaseDocument'  AS check, count(*)::text AS value FROM "VisaCaseDocument";
SELECT 'VERIFY VisaCaseEvidence'  AS check, count(*)::text AS value FROM "VisaCaseEvidence";
SELECT 'VERIFY manual backfilled' AS check, count(*)::text AS value FROM "DocumentAuthenticityCheck" WHERE "applicationId" = 'manual';
