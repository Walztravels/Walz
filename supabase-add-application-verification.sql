-- Secure Application Lookup — verification table.
-- Run ONCE in the Supabase SQL editor. Idempotent — safe to re-run.
-- OTPs are stored only as SHA-256 hashes, never plaintext.

CREATE TABLE IF NOT EXISTS "ApplicationVerification" (
  id               text PRIMARY KEY,
  "applicationId"  text NOT NULL,
  channel          text NOT NULL,
  "staffEmail"     text,
  "conversationId" text,
  method           text,
  status           text NOT NULL DEFAULT 'pending',
  "otpHash"        text,
  "otpExpiresAt"   timestamptz,
  "attemptCount"   integer NOT NULL DEFAULT 0,
  "lockedUntil"    timestamptz,
  "questionId"     text,
  "verifiedAt"     timestamptz,
  "verifiedUntil"  timestamptz,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ApplicationVerification_applicationId_idx"
  ON "ApplicationVerification" ("applicationId");
CREATE INDEX IF NOT EXISTS "ApplicationVerification_conversationId_idx"
  ON "ApplicationVerification" ("conversationId");

-- Lock down: service-role access only (no anon/authenticated policies)
ALTER TABLE "ApplicationVerification" ENABLE ROW LEVEL SECURITY;

SELECT 'ApplicationVerification ready' AS result;
