-- Card Authorization & Pre-Authorization System
-- Run this in Supabase SQL editor before deploying the feature.

CREATE TYPE "CardAuthorizationStatus" AS ENUM (
  'pending',
  'authorized',
  'captured',
  'released',
  'expired',
  'cancelled'
);

CREATE TABLE "card_authorizations" (
  "id"                     TEXT NOT NULL DEFAULT gen_random_uuid(),
  "token"                  TEXT NOT NULL DEFAULT gen_random_uuid(),
  "status"                 "CardAuthorizationStatus" NOT NULL DEFAULT 'pending',
  "amount"                 DOUBLE PRECISION NOT NULL,
  "currency"               TEXT NOT NULL DEFAULT 'gbp',
  "description"            TEXT NOT NULL,
  "clientEmail"            TEXT NOT NULL,
  "clientName"             TEXT NOT NULL,
  "clientPhone"            TEXT,
  "bookingRef"             TEXT,
  "bookingId"              TEXT,
  "applicationId"          TEXT,
  "leadId"                 TEXT,
  "stripePaymentIntentId"  TEXT,
  "stripeCustomerId"       TEXT,
  "authorizedAt"           TIMESTAMP(3),
  "capturedAt"             TIMESTAMP(3),
  "releasedAt"             TIMESTAMP(3),
  "cancelledAt"            TIMESTAMP(3),
  "expiresAt"              TIMESTAMP(3),
  "createdBy"              TEXT NOT NULL,
  "capturedBy"             TEXT,
  "releasedBy"             TEXT,
  "cancelledBy"            TEXT,
  "capturedAmount"         DOUBLE PRECISION,
  "notes"                  TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "card_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "card_authorizations_token_key"                ON "card_authorizations"("token");
CREATE UNIQUE INDEX "card_authorizations_stripePaymentIntentId_key" ON "card_authorizations"("stripePaymentIntentId");

-- Auto-update updatedAt on every row change
CREATE OR REPLACE FUNCTION update_card_authorizations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER card_authorizations_updated_at
BEFORE UPDATE ON "card_authorizations"
FOR EACH ROW EXECUTE FUNCTION update_card_authorizations_updated_at();

-- RLS: enable but allow service-role full access (Prisma uses service-role)
ALTER TABLE "card_authorizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON "card_authorizations"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
