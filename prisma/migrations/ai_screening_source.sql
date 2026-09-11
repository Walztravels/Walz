-- ══════════════════════════════════════════════════════════════════════════
-- AI screening result source labels — answers-only runs must never be
-- mistaken for full CV screening. Idempotent; purely ADDITIVE.
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE "AiScreeningResult"
  ADD COLUMN IF NOT EXISTS "screeningSource" TEXT NOT NULL DEFAULT 'APPLICATION_ANSWERS_ONLY';

-- Backfill existing rows from what actually happened: rows that included
-- CV text were CV+application; the rest were answers-only.
UPDATE "AiScreeningResult" SET "screeningSource" = 'CV_AND_APPLICATION'
WHERE "cvUsed" = TRUE AND "screeningSource" = 'APPLICATION_ANSWERS_ONLY';

-- Verification
SELECT 'VERIFY: screeningSource distribution' AS check,
       "screeningSource" || ' = ' || count(*)::text AS value
FROM "AiScreeningResult" GROUP BY "screeningSource";
