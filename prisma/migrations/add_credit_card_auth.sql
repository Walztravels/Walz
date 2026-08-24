-- Credit Card Authorization module
-- Uses camelCase column names to match Prisma field naming convention.
-- Run in Supabase SQL editor after add_card_auth_v2.sql.

-- ─── credit_card_authorizations ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_card_authorizations (
  id                         TEXT        NOT NULL PRIMARY KEY,
  reference                  TEXT        NOT NULL UNIQUE,
  "secureTokenHash"          TEXT        NOT NULL UNIQUE,
  status                     TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft','sent','opened','active',
      'authentication_required','partially_used','fully_used',
      'expired','revoked','cancelled'
    )),

  -- Cardholder
  "cardholderName"             TEXT        NOT NULL,
  "cardholderEmail"            TEXT        NOT NULL,
  "cardholderPhone"            TEXT,
  "cardholderAddress"          TEXT,
  "cardholderCity"             TEXT,
  "cardholderState"            TEXT,
  "cardholderPostal"           TEXT,
  "cardholderCountry"          TEXT,
  "cardholderRelationship"     TEXT        NOT NULL DEFAULT 'self',
  "cardholderRelationshipNote" TEXT,
  "isPersonalCard"             BOOLEAN     NOT NULL DEFAULT TRUE,
  "companyName"                TEXT,

  -- Traveller / booking
  "travellerName"    TEXT        NOT NULL,
  "bookingReference" TEXT,
  "travelDates"      TEXT,
  supplier           TEXT,
  "serviceType"      TEXT        NOT NULL,

  -- Authorization terms
  currency             TEXT        NOT NULL DEFAULT 'gbp',
  "maxAmountMinor"     BIGINT      NOT NULL,
  "permittedCharges"   TEXT[]      NOT NULL DEFAULT '{}',
  description          TEXT        NOT NULL,
  "allowMultipleCharges" BOOLEAN   NOT NULL DEFAULT FALSE,
  "validUntil"         TIMESTAMPTZ NOT NULL,

  -- Stripe card on file
  "stripeCustomerId"      TEXT,
  "stripePaymentMethodId" TEXT,
  "setupIntentId"         TEXT        UNIQUE,
  "cardBrand"             TEXT,
  "cardLast4"             TEXT,
  "cardExpMonth"          INTEGER,
  "cardExpYear"           INTEGER,

  -- Consent & signature
  "signedAt"          TIMESTAMPTZ,
  "signatureName"     TEXT,
  "signatureDataUrl"  TEXT,
  "ipAddress"         TEXT,
  "userAgent"         TEXT,
  "termsVersion"      TEXT        NOT NULL DEFAULT 'v1',
  "termsSnapshot"     TEXT,
  "allConsentChecked" BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Totals
  "totalChargedMinor" BIGINT      NOT NULL DEFAULT 0,

  -- Lifecycle
  "sentAt"           TIMESTAMPTZ,
  "openedAt"         TIMESTAMPTZ,
  "createdBy"        TEXT        NOT NULL,
  "revokedAt"        TIMESTAMPTZ,
  "revokedBy"        TEXT,
  "revocationReason" TEXT,
  "expiryNotifiedAt" TIMESTAMPTZ,

  notes      TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE credit_card_authorizations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credit_card_authorizations' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON credit_card_authorizations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cca_status        ON credit_card_authorizations (status);
CREATE INDEX IF NOT EXISTS idx_cca_email         ON credit_card_authorizations ("cardholderEmail");
CREATE INDEX IF NOT EXISTS idx_cca_created       ON credit_card_authorizations ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_cca_valid_until   ON credit_card_authorizations ("validUntil");

-- ─── credit_card_authorization_transactions ────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_card_authorization_transactions (
  id                          TEXT        NOT NULL PRIMARY KEY,
  "authorizationId"           TEXT        NOT NULL REFERENCES credit_card_authorizations(id) ON DELETE CASCADE,
  "amountMinor"               BIGINT      NOT NULL,
  currency                    TEXT        NOT NULL,
  description                 TEXT        NOT NULL,
  "idempotencyKey"            TEXT        NOT NULL UNIQUE,
  "stripePaymentIntentId"     TEXT        UNIQUE,
  "stripeChargeId"            TEXT,
  status                      TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending','processing','authentication_required',
      'paid','failed','refunded','partially_refunded'
    )),
  "authenticationTokenHash"   TEXT        UNIQUE,
  "requestedBy"               TEXT        NOT NULL,
  "requestedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "succeededAt"               TIMESTAMPTZ,
  "failedAt"                  TIMESTAMPTZ,
  "failureCode"               TEXT,
  "safeFailureMessage"        TEXT,
  "refundedAmountMinor"       BIGINT,
  "refundedAt"                TIMESTAMPTZ,
  "refundedBy"                TEXT,
  "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE credit_card_authorization_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credit_card_authorization_transactions' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON credit_card_authorization_transactions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cca_tx_auth_id ON credit_card_authorization_transactions("authorizationId");
CREATE INDEX IF NOT EXISTS idx_cca_tx_status  ON credit_card_authorization_transactions(status);

-- ─── credit_card_authorization_events ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_card_authorization_events (
  id              TEXT        NOT NULL PRIMARY KEY,
  "authorizationId" TEXT      NOT NULL REFERENCES credit_card_authorizations(id) ON DELETE CASCADE,
  "eventType"     TEXT        NOT NULL,
  "staffEmail"    TEXT,
  "amountMinor"   BIGINT,
  currency        TEXT,
  "stripeEventId" TEXT        UNIQUE,
  metadata        JSONB,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE credit_card_authorization_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credit_card_authorization_events' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON credit_card_authorization_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cca_ev_auth_id ON credit_card_authorization_events("authorizationId");
CREATE INDEX IF NOT EXISTS idx_cca_ev_type    ON credit_card_authorization_events("eventType");
