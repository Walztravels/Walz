-- Run this in Supabase SQL Editor if the SiteSetting table doesn't exist yet
-- (Check first: SELECT to_regclass('public."SiteSetting"'))

CREATE TABLE IF NOT EXISTS "SiteSetting" (
  "id"        TEXT        NOT NULL,
  "key"       TEXT        NOT NULL,
  "value"     TEXT        NOT NULL,
  "label"     TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SiteSetting_key_key" ON "SiteSetting"("key");

ALTER TABLE "SiteSetting" ENABLE ROW LEVEL SECURITY;

-- Service role (Prisma) has full access; public has no access
CREATE POLICY IF NOT EXISTS "service_role_all" ON "SiteSetting"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed default contact values (safe to re-run — does nothing if keys exist)
INSERT INTO "SiteSetting" ("id", "key", "value", "label") VALUES
  (gen_random_uuid()::text, 'whatsapp_header',         '+447398753797',         'WhatsApp – Header (raw)'),
  (gen_random_uuid()::text, 'whatsapp_header_display', '+44 7398 753797',        'WhatsApp – Header (display)'),
  (gen_random_uuid()::text, 'whatsapp_cta',            '+447398753797',         'WhatsApp – Homepage CTA (raw)'),
  (gen_random_uuid()::text, 'whatsapp_cta_display',    '+447398753797',         'WhatsApp – Homepage CTA (display)'),
  (gen_random_uuid()::text, 'phone_canada',            '+13657200865',          'Phone Canada'),
  (gen_random_uuid()::text, 'phone_uae',               '+971000000000',         'Phone UAE'),
  (gen_random_uuid()::text, 'phone_nigeria',           '+2340000000000',        'Phone Nigeria'),
  (gen_random_uuid()::text, 'phone_ghana',             '+2330000000000',        'Phone Ghana'),
  (gen_random_uuid()::text, 'business_name',           'Walz Travels Ltd',      'Business Name'),
  (gen_random_uuid()::text, 'business_address',        'THE WALZ TRAVELS INC · Ontario, Canada · Registered in England & Wales', 'Business Address'),
  (gen_random_uuid()::text, 'business_email',          'contact@walztravels.com','Business Email')
ON CONFLICT ("key") DO NOTHING;
