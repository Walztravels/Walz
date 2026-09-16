-- ══════════════════════════════════════════════════════════════════════════
-- DI-3 — Embassy Form Cross-Check engine. Idempotent; purely ADDITIVE.
-- Run manually in the Supabase SQL editor after di2_evidence_engine.sql.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "FormCrossCheck" (
  "id"             TEXT PRIMARY KEY,
  "applicationId"  TEXT NOT NULL,
  "formType"       TEXT NOT NULL,
  "fieldsChecked"  INTEGER NOT NULL DEFAULT 0,
  "matches"        INTEGER NOT NULL DEFAULT 0,
  "partialMatches" INTEGER NOT NULL DEFAULT 0,
  "conflicts"      INTEGER NOT NULL DEFAULT 0,
  "missing"        INTEGER NOT NULL DEFAULT 0,
  "unverified"     INTEGER NOT NULL DEFAULT 0,
  "summary"        TEXT,
  "runBy"          TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FormCrossCheck_applicationId_createdAt_idx"
  ON "FormCrossCheck"("applicationId", "createdAt");

CREATE TABLE IF NOT EXISTS "FormCrossCheckFinding" (
  "id"                 TEXT PRIMARY KEY,
  "crossCheckId"       TEXT NOT NULL REFERENCES "FormCrossCheck"("id") ON DELETE CASCADE,
  "category"           TEXT NOT NULL,
  "field"              TEXT NOT NULL,
  "applicationValue"   TEXT,
  "evidenceValue"      TEXT,
  "evidenceSourceType" TEXT,
  "evidenceSourceId"   TEXT,
  "status"             TEXT NOT NULL,
  "confidence"         DOUBLE PRECISION NOT NULL DEFAULT 1,
  "explanation"        TEXT,
  "recommendedAction"  TEXT
);
CREATE INDEX IF NOT EXISTS "FormCrossCheckFinding_crossCheckId_idx" ON "FormCrossCheckFinding"("crossCheckId");
CREATE INDEX IF NOT EXISTS "FormCrossCheckFinding_status_idx"       ON "FormCrossCheckFinding"("status");

-- Verification
SELECT 'VERIFY FormCrossCheck'        AS check, count(*)::text AS value FROM "FormCrossCheck";
SELECT 'VERIFY FormCrossCheckFinding' AS check, count(*)::text AS value FROM "FormCrossCheckFinding";
