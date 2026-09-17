-- ============================================================
-- INBOX-0S.4 — PRODUCTION DUPLICATE AUDIT (STRICTLY READ-ONLY)
-- One single SELECT: paste the whole file into Supabase SQL
-- Editor and run. No DELETE / UPDATE / ALTER / CREATE / DROP.
--
-- Every section emits a SUMMARY row ("duplicate groups: N") even
-- when N = 0, so an empty section is provably a clean result,
-- not a failed query. DETAIL rows list up to 50 duplicate
-- groups per section. Section E reports table row counts.
-- ============================================================

WITH
msg_dupes AS (
  SELECT external_id AS item, COUNT(*) AS copies,
         MIN(created_at)::text AS first_seen, MAX(created_at)::text AS last_seen
  FROM   messages
  WHERE  external_id IS NOT NULL
  GROUP  BY external_id
  HAVING COUNT(*) > 1
),
lead_conv_dupes AS (
  SELECT chatwoot_conversation_id::text AS item, COUNT(*) AS copies
  FROM   leads
  WHERE  chatwoot_conversation_id IS NOT NULL
  GROUP  BY chatwoot_conversation_id
  HAVING COUNT(*) > 1
),
lead_wa_dupes AS (
  SELECT whatsapp_number AS item, COUNT(*) AS copies
  FROM   leads
  WHERE  whatsapp_number IS NOT NULL AND whatsapp_number <> ''
  GROUP  BY whatsapp_number
  HAVING COUNT(*) > 1
),
prisma_lead_dupes AS (
  SELECT source || ' / ' || "sourceId" AS item, COUNT(*) AS copies
  FROM   "Lead"
  WHERE  "sourceId" IS NOT NULL
  GROUP  BY source, "sourceId"
  HAVING COUNT(*) > 1
),
visa_sid_dupes AS (
  SELECT "twilioSid" AS item, COUNT(*) AS copies,
         MIN("createdAt")::text AS first_seen, MAX("createdAt")::text AS last_seen
  FROM   "VisaApplicationMessage"
  WHERE  "twilioSid" IS NOT NULL
  GROUP  BY "twilioSid"
  HAVING COUNT(*) > 1
)

-- ── A. messages.external_id ─────────────────────────────────
SELECT 'A. messages.external_id' AS section, 'SUMMARY' AS kind,
       'duplicate groups'        AS item,    COUNT(*)  AS copies,
       NULL::text AS info
FROM msg_dupes
UNION ALL
SELECT 'A. messages.external_id', 'DETAIL', item, copies,
       'first ' || first_seen || ' · last ' || last_seen
FROM (SELECT * FROM msg_dupes ORDER BY copies DESC LIMIT 50) d

-- ── B1. leads.chatwoot_conversation_id ──────────────────────
UNION ALL
SELECT 'B1. leads.chatwoot_conversation_id', 'SUMMARY',
       'duplicate groups', COUNT(*), NULL
FROM lead_conv_dupes
UNION ALL
SELECT 'B1. leads.chatwoot_conversation_id', 'DETAIL', item, copies, NULL
FROM (SELECT * FROM lead_conv_dupes ORDER BY copies DESC LIMIT 50) d

-- ── B2. leads.whatsapp_number ───────────────────────────────
UNION ALL
SELECT 'B2. leads.whatsapp_number', 'SUMMARY',
       'duplicate groups', COUNT(*), NULL
FROM lead_wa_dupes
UNION ALL
SELECT 'B2. leads.whatsapp_number', 'DETAIL', item, copies, NULL
FROM (SELECT * FROM lead_wa_dupes ORDER BY copies DESC LIMIT 50) d

-- ── C. "Lead" (source, sourceId) — Prisma / Meta webhook key ─
UNION ALL
SELECT 'C. Lead (source, sourceId)', 'SUMMARY',
       'duplicate groups', COUNT(*), NULL
FROM prisma_lead_dupes
UNION ALL
SELECT 'C. Lead (source, sourceId)', 'DETAIL', item, copies, NULL
FROM (SELECT * FROM prisma_lead_dupes ORDER BY copies DESC LIMIT 50) d

-- ── D. "VisaApplicationMessage".twilioSid ───────────────────
UNION ALL
SELECT 'D. VisaApplicationMessage.twilioSid', 'SUMMARY',
       'duplicate groups', COUNT(*), NULL
FROM visa_sid_dupes
UNION ALL
SELECT 'D. VisaApplicationMessage.twilioSid', 'DETAIL', item, copies,
       'first ' || first_seen || ' · last ' || last_seen
FROM (SELECT * FROM visa_sid_dupes ORDER BY copies DESC LIMIT 50) d

-- ── E. Row counts (context / query-success proof) ───────────
UNION ALL
SELECT 'E. row counts', 'CONTEXT', 'messages total',
       (SELECT COUNT(*) FROM messages), NULL
UNION ALL
SELECT 'E. row counts', 'CONTEXT', 'messages with external_id',
       (SELECT COUNT(*) FROM messages WHERE external_id IS NOT NULL), NULL
UNION ALL
SELECT 'E. row counts', 'CONTEXT', 'supabase leads total',
       (SELECT COUNT(*) FROM leads), NULL
UNION ALL
SELECT 'E. row counts', 'CONTEXT', 'prisma "Lead" total',
       (SELECT COUNT(*) FROM "Lead"), NULL
UNION ALL
SELECT 'E. row counts', 'CONTEXT', 'prisma "Lead" with sourceId',
       (SELECT COUNT(*) FROM "Lead" WHERE "sourceId" IS NOT NULL), NULL
UNION ALL
SELECT 'E. row counts', 'CONTEXT', 'VisaApplicationMessage total',
       (SELECT COUNT(*) FROM "VisaApplicationMessage"), NULL
UNION ALL
SELECT 'E. row counts', 'CONTEXT', 'VisaApplicationMessage with twilioSid',
       (SELECT COUNT(*) FROM "VisaApplicationMessage" WHERE "twilioSid" IS NOT NULL), NULL

ORDER BY section, kind DESC, copies DESC;
