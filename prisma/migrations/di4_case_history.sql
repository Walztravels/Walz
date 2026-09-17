-- ══════════════════════════════════════════════════════════════════════════
-- DI-4 — Case Intelligence History. Idempotent; purely ADDITIVE.
-- Run manually in the Supabase SQL editor after di3_cross_check.sql.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "CaseIntelligenceEvent" (
  "id"            TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL,
  "eventType"     TEXT NOT NULL,
  "actor"         TEXT NOT NULL,
  "refType"       TEXT,
  "refId"         TEXT,
  "summary"       TEXT,
  "metadata"      JSONB NOT NULL DEFAULT '{}',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CaseIntelligenceEvent_applicationId_createdAt_idx"
  ON "CaseIntelligenceEvent"("applicationId", "createdAt");
CREATE INDEX IF NOT EXISTS "CaseIntelligenceEvent_eventType_idx"
  ON "CaseIntelligenceEvent"("eventType");

CREATE TABLE IF NOT EXISTS "GeneratedLetter" (
  "id"            TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL,
  "letterType"    TEXT NOT NULL,
  "letterLabel"   TEXT,
  "content"       TEXT NOT NULL,
  "version"       INTEGER NOT NULL DEFAULT 1,
  "generatedBy"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "GeneratedLetter_applicationId_createdAt_idx"
  ON "GeneratedLetter"("applicationId", "createdAt");

-- Verification
SELECT 'VERIFY CaseIntelligenceEvent' AS check, count(*)::text AS value FROM "CaseIntelligenceEvent";
SELECT 'VERIFY GeneratedLetter'       AS check, count(*)::text AS value FROM "GeneratedLetter";
