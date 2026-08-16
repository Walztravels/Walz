-- Visa Application WhatsApp Thread
-- Run in Supabase SQL editor

-- BSUID field on VisaApplication (Meta WhatsApp 2026 username rollout)
ALTER TABLE "VisaApplication"
  ADD COLUMN IF NOT EXISTS "whatsappBsuid" TEXT;

CREATE INDEX IF NOT EXISTS "VisaApplication_whatsappBsuid_idx"
  ON "VisaApplication" ("whatsappBsuid");

-- Scoped WhatsApp message store
CREATE TABLE IF NOT EXISTS "VisaApplicationMessage" (
  "id"                TEXT        PRIMARY KEY,
  "visaApplicationId" TEXT        NOT NULL REFERENCES "VisaApplication"("id") ON DELETE CASCADE,
  "direction"         TEXT        NOT NULL,         -- 'outbound' | 'inbound'
  "body"              TEXT        NOT NULL,
  "sentBy"            TEXT,                         -- staff id, null for inbound
  "fromBsuid"         TEXT,                         -- BSUID from Meta webhook
  "status"            TEXT        NOT NULL DEFAULT 'sent',
  "twilioSid"         TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "VisaApplicationMessage_visaApplicationId_idx"
  ON "VisaApplicationMessage" ("visaApplicationId");

CREATE INDEX IF NOT EXISTS "VisaApplicationMessage_twilioSid_idx"
  ON "VisaApplicationMessage" ("twilioSid");
