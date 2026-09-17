-- ══════════════════════════════════════════════════════════════════════════
-- INT-7 — Embassy Intelligence Feed: official-source change detection.
-- Idempotent; purely ADDITIVE. Run manually in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "EmbassySourceSnapshot" (
  "id"           TEXT PRIMARY KEY,
  "sourceId"     TEXT NOT NULL,
  "contentHash"  TEXT NOT NULL,
  "etag"         TEXT,
  "lastModified" TEXT,
  "extract"      TEXT,
  "httpStatus"   INTEGER NOT NULL,
  "changed"      BOOLEAN NOT NULL DEFAULT FALSE,
  "fetchedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmbassySourceSnapshot_sourceId_fetchedAt_idx"
  ON "EmbassySourceSnapshot"("sourceId", "fetchedAt");

-- Join alerts back to their registry source.
ALTER TABLE "EmbassyIntelligenceFeed" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

-- Verification
SELECT 'VERIFY EmbassySourceSnapshot' AS check, count(*)::text AS value FROM "EmbassySourceSnapshot";
