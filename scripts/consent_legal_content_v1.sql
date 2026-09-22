-- ============================================================
-- WALZ CONSENT FOUNDATION V1 — legal content update (idempotent, hand-run
-- in the Supabase SQL Editor).
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT. This file is
-- returned for review only, per the standing implementation instruction.
-- It has NOT been executed by the implementing agent.
--
-- WHY A .sql FILE RATHER THAN RE-RUNNING scripts/seed-legal-content.ts
--   scripts/seed-legal-content.ts is the INITIAL seed: it skips every row
--   that already exists, so re-running it plain would change nothing, and
--   re-running it with --force would overwrite ALL 52 privacy/terms rows,
--   discarding any edit a super_admin has since made via /admin/content.
--   This release changes exactly TWO rows, so it updates exactly two rows.
--   lib/content/legal-content.ts remains the source of truth and the
--   fallback render source; this file only brings the live DB rows into
--   line with it.
--
-- SCOPE
--   updates 2 rows in "SiteContent" : privacy_s5_body, terms_s13_body
--   creates 0 tables, adds 0 columns, drops nothing
--   touches 0 rows in any other group, 0 rows in "Lead",
--           0 rows in whatsapp_consents, 0 rows in consent_records
--
-- WHAT CHANGED AND WHY (Twilio A2P 10DLC, rejection error 30896)
--   privacy_s5_body — the existing sentence said "We do not sell or share
--     your SMS opt-in data or personal information with third parties for
--     marketing purposes." Twilio's review looks specifically for MOBILE
--     INFORMATION (the phone number itself, not just "opt-in data"), and
--     for AFFILIATES alongside third parties. The replacement names both
--     and states explicitly that SMS consent is excluded from every
--     sharing category listed earlier in the same section.
--   terms_s13_body — the existing SMS section bundled "occasional
--     promotional offers" into the SAME opt-in as booking and support
--     messages. That directly contradicts a CUSTOMER_CARE campaign
--     registration and contradicts the new checkbox, which promises
--     service messages only. The replacement separates the customer care
--     programme from the marketing programme, states that consent is not
--     a condition of purchase, and keeps the existing frequency / rates /
--     STOP / HELP / carrier-liability language.
--
-- IDEMPOTENT: INSERT ... ON CONFLICT ("key") DO UPDATE, so it is safe
-- whether the row already exists (the normal case, post-seed) or not (a
-- database where seed-legal-content.ts was never run). Re-running it
-- simply rewrites the same two values.
--
-- NOTE ON ADMIN EDITS: this DOES overwrite these two rows if a super_admin
-- edited them by hand. That is intended — they are the rows carrying the
-- carrier-required disclosures. Check /admin/content → Privacy §5 and
-- Terms §13 before running if you believe either was hand-edited.
-- ============================================================

BEGIN;

-- "SiteContent" has no @@map and no per-field @map, so its identifiers are
-- the quoted camelCase Prisma names. "group" is additionally a reserved
-- word and must stay quoted. id/updatedAt are Prisma-side defaults
-- (cuid() / @updatedAt) with no database default, so both are supplied
-- explicitly here — exactly as a hand-run insert must.

-- ── Privacy §5 (Data Sharing) ───────────────────────────────────────────
INSERT INTO "SiteContent" ("id", "key", "value", "type", "label", "group", "page", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'privacy_s5_body',
  $legal$We share your data only as necessary to deliver our services:

• Airlines and Global Distribution Systems (Sabre GDS) — for flight bookings
• Hotels and accommodation providers — for hotel reservations
• Embassy or visa processing centres — for visa applications
• Stripe — for secure payment processing
• Resend — for transactional email delivery
• Supabase — for secure database hosting (EU region)
• Our WhatsApp business support team

We do not sell your personal data to third parties for marketing purposes.

Mobile information — including your mobile phone number and your SMS opt-in consent — will not be shared with third parties or affiliates for marketing or promotional purposes. Your SMS consent and the phone number you provide for SMS are excluded from every category of data sharing described above: they are used only by Walz Travels to send you the messages you asked to receive.$legal$,
  'text',
  'Privacy — 5. Data Sharing (Body)',
  'privacy',
  'general',
  now()
)
ON CONFLICT ("key") DO UPDATE
  SET "value"     = EXCLUDED."value",
      "label"     = EXCLUDED."label",
      "group"     = EXCLUDED."group",
      "updatedAt" = now();

-- ── Terms §13 (SMS Messaging) ───────────────────────────────────────────
INSERT INTO "SiteContent" ("id", "key", "value", "type", "label", "group", "page", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'terms_s13_body',
  $legal$Walz Travels operates separate SMS programmes and you opt in to each one independently. Ticking the box for one does not opt you in to the other, and we will not move you between them without a fresh opt-in.

Customer care SMS: when you tick the SMS consent box on a Walz Travels booking, enquiry or application form, you agree to receive text messages from Walz Travels about your bookings, travel arrangements, visa and application updates, customer support requests, payment reminders and other service-related communications. Consent is not a condition of purchase — you can complete any booking or application without ticking the box.

Marketing SMS: promotional and marketing text messages are a separate opt-in. We will never send them on the basis of your customer care consent alone.

For both programmes: message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time, or reply HELP for help. You can also email contact@walztravels.com to be removed. Carriers are not liable for delayed or undelivered messages.

We do not sell or share your mobile information — including your phone number and your SMS consent — with third parties or affiliates for marketing or promotional purposes. See our Privacy Policy for details.$legal$,
  'text',
  'Terms — 13. SMS Messaging (Body)',
  'terms',
  'general',
  now()
)
ON CONFLICT ("key") DO UPDATE
  SET "value"     = EXCLUDED."value",
      "label"     = EXCLUDED."label",
      "group"     = EXCLUDED."group",
      "updatedAt" = now();

COMMIT;

-- ────────────────────────────────────────────────────────────
-- Validation — every carrier-required phrase is now live.
-- ────────────────────────────────────────────────────────────
SELECT
  'consent_legal_content_v1' AS migration,
  (SELECT COUNT(*) FROM "SiteContent" WHERE "key" = 'privacy_s5_body')                        AS privacy_s5_row,
  (SELECT COUNT(*) FROM "SiteContent" WHERE "key" = 'terms_s13_body')                         AS terms_s13_row,
  -- Twilio's mobile-information / affiliates requirement.
  (SELECT COUNT(*) FROM "SiteContent"
     WHERE "key" = 'privacy_s5_body'
       AND "value" LIKE '%Mobile information%'
       AND "value" LIKE '%third parties or affiliates%')                                      AS privacy_mobile_clause,
  -- The four messaging-terms elements plus the not-a-condition statement.
  (SELECT COUNT(*) FROM "SiteContent"
     WHERE "key" = 'terms_s13_body'
       AND "value" LIKE '%message frequency varies%'
       AND "value" LIKE '%Message and data rates may apply%'
       AND "value" LIKE '%Reply STOP to opt out%'
       AND "value" LIKE '%reply HELP for help%'
       AND "value" LIKE '%Carriers are not liable%'
       AND "value" LIKE '%Consent is not a condition of purchase%')                           AS terms_sms_elements,
  -- The old bundled-marketing wording is gone (it contradicted the
  -- CUSTOMER_CARE registration).
  (SELECT COUNT(*) FROM "SiteContent"
     WHERE "key" = 'terms_s13_body'
       AND "value" LIKE '%occasional promotional offers%')                                    AS stale_marketing_wording_expect_0,
  -- Nothing else in either group was touched.
  (SELECT COUNT(*) FROM "SiteContent" WHERE "group" = 'privacy')                              AS privacy_rows_unchanged,
  (SELECT COUNT(*) FROM "SiteContent" WHERE "group" = 'terms')                                AS terms_rows_unchanged;
-- Expect: consent_legal_content_v1 | 1 | 1 | 1 | 1 | 0 | 24 | 28
