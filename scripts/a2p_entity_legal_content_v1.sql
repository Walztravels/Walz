-- ============================================================
-- WALZ A2P ENTITY + SMS CONSENT — legal content update (idempotent, hand-run
-- in the Supabase SQL Editor). Twilio A2P 10DLC campaign rejection, error 30907
-- (campaign registered to "The Walz Travels Inc." (Canada) but the website only
-- named "Walz Travels Ltd" (UK)). The A2P registration is CUSTOMER_CARE only:
-- no SMS copy in this file mentions promotional or marketing SMS.
--
-- OWNER: DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT.
-- It has NOT been executed by the implementing agent. It OVERWRITES the 7 rows listed under
-- SCOPE below even if a super_admin edited them. Run it LAST (after consent_legal_content_v1.sql).
--
-- WHY A .sql FILE RATHER THAN RE-RUNNING scripts/seed-legal-content.ts
--   scripts/seed-legal-content.ts is the INITIAL seed: it skips every row
--   that already exists, and --force would overwrite ALL privacy/terms rows,
--   discarding any edit a super_admin has since made via /admin/content.
--   This release touches exactly the rows listed below and nothing else.
--   lib/content/legal-content.ts remains the source of truth and the
--   fallback render source (a missing privacy_s13 row still renders on
--   /privacy from the code fallback); this file only brings the live DB
--   rows into line with it. The values below are generated from, and
--   guarded against drift by __tests__/a2p-entity-consent.test.ts.
--
-- SCOPE
--   upserts 7 rows (overwrites any admin edit of them) in "SiteContent":
--     privacy_s1_body, privacy_s12_body,
--     privacy_s13_title, privacy_s13_body      (privacy_s13 is NEW: 13. SMS and Mobile Messaging)
--     terms_s1_body, terms_s13_body, terms_s14_body
--   creates 0 tables, adds 0 columns (0 schema changes), drops nothing
--   touches 0 rows in any other group, 0 rows in "Lead",
--           0 rows in whatsapp_consents, 0 rows in consent_records
--   Section headings of existing sections are NOT rewritten (unchanged).
--   PLUS one surgical fix to the live "SiteSetting" row key='business_address':
--   if (and only if) its value contains 'Registered in England', it is set to
--   'The Walz Travels Inc. · Ontario, Canada' (a Canadian Inc. is not
--   "registered in England & Wales"). No-op otherwise; admin edits without
--   that phrase are untouched. Only the "value" and "updatedAt" columns change.
--   PLUS one surgical text replacement (not an overwrite) on the existing
--   "about_company_story" row, group 'about': only the capitalised phrase
--   'THE WALZ TRAVELS INC' becomes 'The Walz Travels Inc.'; the rest of
--   the row (including any admin edits) is preserved. No-op if the row is
--   absent or already fixed.
--
-- ORDER OF EXECUTION: if you also run scripts/consent_legal_content_v1.sql,
--   run THAT one first and THIS one LAST — the older file still carries the
--   previous terms_s13 body and would revert it if run afterwards.
--
-- WHAT CHANGED AND WHY
--   Two legitimate entities operate under the one Walz Travels brand:
--   The Walz Travels Inc. (Canada, owner of the A2P SMS programme) and
--   Walz Travels Ltd (United Kingdom, name unchanged). The site previously
--   named only the UK company. Privacy s1/s12 and Terms s1/s14 now name both
--   entities; Privacy s13 (new) and Terms s13 state that SMS is sent by
--   The Walz Travels Inc., operating as Walz Travels, list the customer-care
--   message types, and carry frequency / rates / STOP / HELP /
--   not-a-condition / no-sharing language. Governing law (England and Wales) is unchanged.
--
-- LABEL / GROUP CONVENTIONS (mirrors scripts/seed-legal-content.ts and
--   app/api/admin/content/site/route.ts DEFAULTS):
--     key   = "<section>_title" | "<section>_body"   e.g. privacy_s13_body
--     label = "Privacy — <section title> (Heading|Body)" / "Terms — ..."
--     group = 'privacy' | 'terms'   type = 'text'   page = 'general'
--
-- IDEMPOTENT: INSERT ... ON CONFLICT ("key") DO UPDATE, so it is safe
-- whether the row already exists (the normal case, post-seed) or not.
-- Re-running it simply rewrites the same values.
--
-- NOTE ON ADMIN EDITS: this DOES overwrite these rows if a super_admin
-- edited them by hand. That is intended — they carry the entity and
-- carrier-required disclosures. Check /admin/content (Privacy s1, s12;
-- Terms s1, s13, s14) before running if you believe any was hand-edited.
--
-- NO BACKFILL: this file changes public policy text only. It creates no
-- consent rows; existing customers are NOT opted in to anything.
-- ============================================================

BEGIN;

-- "SiteContent" has no @@map and no per-field @map, so its identifiers are
-- the quoted camelCase Prisma names. "group" is additionally a reserved
-- word and must stay quoted. id/updatedAt are Prisma-side defaults
-- (cuid() / @updatedAt) with no database default, so both are supplied
-- explicitly here — exactly as a hand-run insert must.

-- ── Privacy §1 (body) ──────────────────────────────────────────
INSERT INTO "SiteContent" ("id", "key", "value", "type", "label", "group", "page", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'privacy_s1_body',
  $legal$Walz Travels is an international travel services brand operated through locally registered entities in Canada and the United Kingdom.

Canada: The Walz Travels Inc.
United Kingdom: Walz Travels Ltd

In this Privacy Policy, "Walz Travels", "we", "us" and "our" refer to the Walz Travels brand and the locally registered entity that provides the service you use. SMS communications are provided by The Walz Travels Inc. — see Section 13.

We operate the website walztravels.com and related services including flight booking, hotel booking, private tours, visa assistance and gift vouchers.

For any privacy-related queries, contact us at: contact@walztravels.com$legal$,
  'text',
  'Privacy — 1. Who We Are (Body)',
  'privacy',
  'general',
  now()
)
ON CONFLICT ("key") DO UPDATE
  SET "value"     = EXCLUDED."value",
      "label"     = EXCLUDED."label",
      "group"     = EXCLUDED."group",
      "updatedAt" = now();

-- ── Privacy §12 (body) ──────────────────────────────────────────
INSERT INTO "SiteContent" ("id", "key", "value", "type", "label", "group", "page", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'privacy_s12_body',
  $legal$For any privacy-related questions, requests or complaints:

Email: contact@walztravels.com
WhatsApp: +1 231 790 2336
Canada: The Walz Travels Inc.
United Kingdom: Walz Travels Ltd

If you are unsatisfied with our response, you have the right to lodge a complaint with the Information Commissioner's Office (ICO) at ico.org.uk.$legal$,
  'text',
  'Privacy — 12. Contact Us (Body)',
  'privacy',
  'general',
  now()
)
ON CONFLICT ("key") DO UPDATE
  SET "value"     = EXCLUDED."value",
      "label"     = EXCLUDED."label",
      "group"     = EXCLUDED."group",
      "updatedAt" = now();

-- ── Privacy §13 (title) ──────────────────────────────────────────
INSERT INTO "SiteContent" ("id", "key", "value", "type", "label", "group", "page", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'privacy_s13_title',
  '13. SMS and Mobile Messaging',
  'text',
  'Privacy — 13. SMS and Mobile Messaging (Heading)',
  'privacy',
  'general',
  now()
)
ON CONFLICT ("key") DO UPDATE
  SET "value"     = EXCLUDED."value",
      "label"     = EXCLUDED."label",
      "group"     = EXCLUDED."group",
      "updatedAt" = now();

-- ── Privacy §13 (body) ──────────────────────────────────────────
INSERT INTO "SiteContent" ("id", "key", "value", "type", "label", "group", "page", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'privacy_s13_body',
  $legal$SMS communications under the Canadian messaging program are provided by The Walz Travels Inc., operating as Walz Travels.

Mobile information we collect:
We may collect your mobile phone number and a record of your SMS consent, including the date and time of consent, the version of the consent wording presented to you, and the page or form through which consent was provided. We use this information to provide requested SMS communications, maintain consent records, process opt-outs and support compliance obligations.

If you opt in, SMS messages may include travel enquiry responses, booking confirmations and updates, payment reminders, itinerary updates, visa-service updates, appointment or consultation reminders and customer-support communications.

Message frequency varies. Message and data rates may apply. Consent is not a condition of purchase.

You may reply STOP to opt out or HELP for assistance. You may also contact contact@walztravels.com regarding your SMS preferences.

Mobile information, including your mobile phone number and SMS opt-in consent, will not be shared with third parties or affiliates for their marketing or promotional purposes.

See our Terms of Service for additional information about the SMS messaging programme.$legal$,
  'text',
  'Privacy — 13. SMS and Mobile Messaging (Body)',
  'privacy',
  'general',
  now()
)
ON CONFLICT ("key") DO UPDATE
  SET "value"     = EXCLUDED."value",
      "label"     = EXCLUDED."label",
      "group"     = EXCLUDED."group",
      "updatedAt" = now();

-- ── Terms §1 (body) ──────────────────────────────────────────
INSERT INTO "SiteContent" ("id", "key", "value", "type", "label", "group", "page", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'terms_s1_body',
  $legal$These Terms of Service ("Terms") govern your use of the Walz Travels website (walztravels.com) and all related booking services provided under the Walz Travels brand through locally registered entities in Canada (The Walz Travels Inc.) and the United Kingdom (Walz Travels Ltd) ("Walz Travels", "we", "us" or "our"). SMS communications are provided by The Walz Travels Inc. — see Section 13 (SMS Messaging).

By accessing our website or placing a booking, you agree to be bound by these Terms. If you do not agree, please do not use our services.$legal$,
  'text',
  'Terms — 1. About These Terms (Body)',
  'terms',
  'general',
  now()
)
ON CONFLICT ("key") DO UPDATE
  SET "value"     = EXCLUDED."value",
      "label"     = EXCLUDED."label",
      "group"     = EXCLUDED."group",
      "updatedAt" = now();

-- ── Terms §13 (body) ──────────────────────────────────────────
INSERT INTO "SiteContent" ("id", "key", "value", "type", "label", "group", "page", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'terms_s13_body',
  $legal$SMS communications under the Canadian messaging program are provided by The Walz Travels Inc., operating under the Walz Travels brand.

Sender:
The Walz Travels Inc., operating as Walz Travels.

If you voluntarily opt in, you may receive SMS messages relating to travel enquiries, booking confirmations, booking updates, itinerary notifications, payment reminders, visa-service notifications, appointment and consultation reminders, and customer-support communications.

Message frequency varies. Message and data rates may apply.

Reply STOP to opt out. Reply HELP for help.

Consent is not a condition of purchase.

You may also contact contact@walztravels.com regarding your SMS preferences.

We do not sell or share mobile information, including mobile phone numbers and SMS consent information, with third parties or affiliates for their marketing or promotional purposes.

See our Privacy Policy for additional information.$legal$,
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

-- ── Terms §14 (body) ──────────────────────────────────────────
INSERT INTO "SiteContent" ("id", "key", "value", "type", "label", "group", "page", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'terms_s14_body',
  $legal$Walz Travels
Canada: The Walz Travels Inc.
United Kingdom: Walz Travels Ltd
Email: contact@walztravels.com
WhatsApp: +1 231 790 2336$legal$,
  'text',
  'Terms — 14. Contact (Body)',
  'terms',
  'general',
  now()
)
ON CONFLICT ("key") DO UPDATE
  SET "value"     = EXCLUDED."value",
      "label"     = EXCLUDED."label",
      "group"     = EXCLUDED."group",
      "updatedAt" = now();

-- About page: normalise the capitalised Canadian entity name in place.
-- replace() only, so nothing else in the row changes; WHERE makes it a
-- no-op when there is nothing to fix (safe to re-run).
UPDATE "SiteContent"
   SET "value"     = replace("value", 'THE WALZ TRAVELS INC', 'The Walz Travels Inc.'),
       "updatedAt" = now()
 WHERE "key" = 'about_company_story'
   AND "group" = 'about'
   AND "value" LIKE '%THE WALZ TRAVELS INC%';

-- Live site setting: remove the contradictory "Registered in England"
-- claim from the Canadian Inc. business address. Idempotent: matches only
-- while the phrase is present. ("SiteSetting": id, key, value, label,
-- createdAt, updatedAt; updatedAt has a Prisma-side default only, so it is
-- set explicitly.)
UPDATE "SiteSetting"
   SET "value"     = 'The Walz Travels Inc. · Ontario, Canada',
       "updatedAt" = now()
 WHERE "key" = 'business_address'
   AND "value" ILIKE '%Registered in England%';

COMMIT;

-- ────────────────────────────────────────────────────────────
-- Validation — entity naming and SMS clauses are now live.
-- ────────────────────────────────────────────────────────────
SELECT
  'a2p_entity_legal_content_v1' AS migration,
  (SELECT COUNT(*) FROM "SiteContent"
     WHERE "key" IN ('privacy_s1_body','privacy_s12_body','privacy_s13_title','privacy_s13_body',
                     'terms_s1_body','terms_s13_body','terms_s14_body'))                         AS rows_present,
  (SELECT COUNT(*) FROM "SiteContent"
     WHERE "key" IN ('privacy_s1_body','privacy_s12_body','terms_s1_body','terms_s14_body')
       AND "value" LIKE '%The Walz Travels Inc.%'
       AND "value" LIKE '%Walz Travels Ltd%')                                                    AS both_entities_named_expect_4,
  (SELECT COUNT(*) FROM "SiteContent"
     WHERE "key" = 'terms_s13_body'
       AND "value" LIKE '%SMS communications under the Canadian messaging program are provided by The Walz Travels Inc., operating under the Walz Travels brand.%'
       AND "value" LIKE '%Sender:' || chr(10) || 'The Walz Travels Inc., operating as Walz Travels.%'
       AND "value" LIKE '%Message frequency varies. Message and data rates may apply.%'
       AND "value" LIKE '%Reply STOP to opt out. Reply HELP for help.%'
       AND "value" LIKE '%Consent is not a condition of purchase.%')                             AS terms_sms_elements_expect_1,
  (SELECT COUNT(*) FROM "SiteContent"
     WHERE "key" = 'privacy_s13_body'
       AND "value" LIKE '%Message frequency varies. Message and data rates may apply. Consent is not a condition of purchase.%'
       AND "value" LIKE '%reply STOP to opt out or HELP for assistance%'
       AND "value" LIKE '%will not be shared with third parties or affiliates for their marketing or promotional purposes.%') AS privacy_sms_section_expect_1,
  -- No SMS row mentions promotional SMS / messages.
  (SELECT COUNT(*) FROM "SiteContent"
     WHERE "key" IN ('privacy_s13_body','terms_s13_body')
       AND ("value" ILIKE '%promotional SMS%' OR "value" ILIKE '%promotional messages%'
            OR "value" ILIKE '%marketing SMS%' OR "value" ILIKE '%travel deals%'))              AS promo_sms_mentions_expect_0,
  -- The old UK-only wording is gone.
  (SELECT COUNT(*) FROM "SiteContent"
     WHERE "key" IN ('privacy_s1_body','terms_s1_body')
       AND "value" LIKE '%is a travel agency operating in the United Kingdom%')                  AS stale_uk_only_wording_expect_0,
  -- About page: capitalised entity name is gone (0 = fixed or row absent).
  (SELECT COUNT(*) FROM "SiteContent"
     WHERE "key" = 'about_company_story'
       AND "value" LIKE '%THE WALZ TRAVELS INC%')                                                AS about_caps_expect_0,
  -- Live business address no longer claims registration in England.
  (SELECT COUNT(*) FROM "SiteSetting"
     WHERE "key" = 'business_address'
       AND "value" ILIKE '%Registered in England%')                                              AS address_england_expect_0,
  (SELECT COUNT(*) FROM "SiteContent" WHERE "group" = 'privacy')                                 AS privacy_rows,
  (SELECT COUNT(*) FROM "SiteContent" WHERE "group" = 'terms')                                   AS terms_rows;
-- Expect: a2p_entity_legal_content_v1 | 7 | 4 | 1 | 1 | 0 | 0 | 0 | 0 | 26 | 28
