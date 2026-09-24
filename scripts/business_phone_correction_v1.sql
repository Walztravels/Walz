-- ============================================================
-- WALZ BUSINESS PHONE CORRECTION — database-backed values (hand-run in the
-- Supabase SQL Editor; idempotent). NOT executed by the implementing agent.
--
-- WHY: the business Phone/Call number shown on the site was wrong. The
-- correct number — the SAME number as WhatsApp — is:
--     +1 231 790 2336      (E.164 +12317902336)
-- The code fix (lib/config/business.ts and hard-coded copies) removes the
-- wrong number from every page the app renders from code. Any COPY of the
-- wrong number that was previously SAVED into the database (a site setting,
-- an editable content row, the email-signature settings) is not touched by
-- a deploy and is corrected here.
--
-- SCOPE (surgical — only cells that actually contain the wrong number):
--   "SiteSetting".value       rows whose value contains the wrong number
--   "SiteContent".value       rows whose value contains the wrong number
--   "SignatureSettings".phone the singleton row, if it holds the wrong number
--   Only the matching text inside those cells is replaced; the rest of each
--   value is preserved. No other column, row, or table is touched. No schema
--   change, no deletes, no DDL. Customer data, leads, bookings and every
--   other telephone number are NOT touched.
--
-- HOW IT MATCHES: the wrong number in the forms it can be stored in
--   (spaced / dashed / dotted / parenthesised display, E.164 with or without
--   '+', bare 10-digit). Every pattern is DIGIT-BOUNDED: a different number
--   that merely contains the same digits (e.g. a longer international
--   number) is NOT matched and NOT changed.
--
-- STEP 1 (read-only): run the DISCOVERY block first and look at what it
-- finds. STEP 2: run the UPDATE block. STEP 3: run the VALIDATION query
-- (every count must be 0).
-- ============================================================

-- ── STEP 1 — DISCOVERY (read-only). Shows where the wrong number is stored
-- with a short snippet of surrounding text (business copy only) so you can
-- eyeball every row BEFORE step 2 changes anything. ─────────────────────
SELECT 'SiteSetting' AS source, "key" AS name,
       substring("value" from '(.{0,30}(?:(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])).{0,12})') AS snippet
  FROM "SiteSetting"
 WHERE "value" ~ '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])'
UNION ALL
SELECT 'SiteContent', "key",
       substring("value" from '(.{0,30}(?:(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])).{0,12})')
  FROM "SiteContent"
 WHERE "value" ~ '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])'
UNION ALL
SELECT 'SignatureSettings', "id",
       "phone"
  FROM "SignatureSettings"
 WHERE "phone" ~ '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])';

-- ── STEP 2 — CORRECTION ──────────────────────────────────────────────────
BEGIN;

UPDATE "SiteSetting"
   SET "value" = regexp_replace(regexp_replace(regexp_replace("value",
           '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])', '\1\2231\3\4790\52336', 'g'),
           '(?<![0-9])19843880110(?![0-9])', '12317902336', 'g'),
           '(?<![0-9])9843880110(?![0-9])', '2317902336', 'g'),
       "updatedAt" = now()
 WHERE "value" ~ '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])';

UPDATE "SiteContent"
   SET "value" = regexp_replace(regexp_replace(regexp_replace("value",
           '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])', '\1\2231\3\4790\52336', 'g'),
           '(?<![0-9])19843880110(?![0-9])', '12317902336', 'g'),
           '(?<![0-9])9843880110(?![0-9])', '2317902336', 'g'),
       "updatedAt" = now()
 WHERE "value" ~ '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])';

UPDATE "SignatureSettings"
   SET "phone" = regexp_replace(regexp_replace(regexp_replace("phone",
           '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])', '\1\2231\3\4790\52336', 'g'),
           '(?<![0-9])19843880110(?![0-9])', '12317902336', 'g'),
           '(?<![0-9])9843880110(?![0-9])', '2317902336', 'g'),
       "updatedAt" = now()
 WHERE "phone" ~ '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])';

COMMIT;

-- ── STEP 3 — VALIDATION (every count must be 0) ─────────────────────────
SELECT
  (SELECT COUNT(*) FROM "SiteSetting"       WHERE "value" ~ '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])') AS site_setting_expect_0,
  (SELECT COUNT(*) FROM "SiteContent"       WHERE "value" ~ '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])') AS site_content_expect_0,
  (SELECT COUNT(*) FROM "SignatureSettings" WHERE "phone" ~ '(?<![0-9])(\+?1[ .-]*)?(\(?)984(\)?)([ .-]+)388([ .-]+)0110(?![0-9])|(?<![0-9])19843880110(?![0-9])|(?<![0-9])9843880110(?![0-9])') AS signature_settings_expect_0;
-- Expect: 0 | 0 | 0
