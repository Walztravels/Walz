-- ══════════════════════════════════════════════════════════════════════════
-- Walz Recruitment Hub — Release 9: offers & talent pools
-- Run manually in the Supabase SQL editor. Idempotent; safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "JobOffer" (
  "id"                 TEXT PRIMARY KEY,
  "applicationId"      TEXT NOT NULL REFERENCES "JobApplication"("id") ON DELETE CASCADE,
  "status"             TEXT NOT NULL DEFAULT 'draft',
  "jobTitle"           TEXT NOT NULL,
  "compensationType"   TEXT NOT NULL DEFAULT 'salary',
  "compensationAmount" DECIMAL(12,2),
  "currency"           TEXT NOT NULL DEFAULT 'NGN',
  "compensationNotes"  TEXT,
  "startDate"          TIMESTAMP(3),
  "terms"              TEXT,
  "tokenHash"          TEXT,
  "tokenExpiresAt"     TIMESTAMP(3),
  "createdBy"          TEXT NOT NULL,
  "sentAt"             TIMESTAMP(3),
  "respondedAt"        TIMESTAMP(3),
  "candidateNote"      TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "JobOffer_tokenHash_key" ON "JobOffer"("tokenHash");
CREATE INDEX IF NOT EXISTS "JobOffer_applicationId_createdAt_idx"
  ON "JobOffer"("applicationId", "createdAt");

CREATE TABLE IF NOT EXISTS "TalentPoolEntry" (
  "id"                  TEXT PRIMARY KEY,
  "candidateId"         TEXT NOT NULL,
  "addedBy"             TEXT NOT NULL,
  "reason"              TEXT,
  "tags"                JSONB NOT NULL DEFAULT '[]',
  "sourceApplicationId" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "TalentPoolEntry_candidateId_key"
  ON "TalentPoolEntry"("candidateId");
CREATE INDEX IF NOT EXISTS "TalentPoolEntry_createdAt_idx" ON "TalentPoolEntry"("createdAt");

-- Done. Verify with:
--   SELECT count(*) FROM "JobOffer"; SELECT count(*) FROM "TalentPoolEntry";
