-- ============================================================
-- STAFF UPDATES — MULTI-CHANNEL NOTIFICATION (hand-run, additive only)
-- Run in Supabase SQL Editor. Adds two new tables:
--   AnnouncementAcknowledgement — per-(announcement, staff) read/ack state
--   AnnouncementEmailDelivery   — per-(announcement, staff) email delivery tracking
-- No existing table/column/enum is altered. No data is touched.
-- ============================================================

CREATE TABLE IF NOT EXISTS "AnnouncementAcknowledgement" (
  "id"             text        NOT NULL,
  "announcementId" text        NOT NULL,
  "staffId"        text        NOT NULL,
  "readAt"         timestamp(3),
  "acknowledgedAt" timestamp(3),
  "createdAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      timestamp(3) NOT NULL,
  CONSTRAINT "AnnouncementAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementAcknowledgement_announcementId_staffId_key"
  ON "AnnouncementAcknowledgement" ("announcementId", "staffId");
CREATE INDEX IF NOT EXISTS "AnnouncementAcknowledgement_announcementId_idx"
  ON "AnnouncementAcknowledgement" ("announcementId");
CREATE INDEX IF NOT EXISTS "AnnouncementAcknowledgement_staffId_idx"
  ON "AnnouncementAcknowledgement" ("staffId");

DO $$ BEGIN
  ALTER TABLE "AnnouncementAcknowledgement"
    ADD CONSTRAINT "AnnouncementAcknowledgement_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "StaffAnnouncement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AnnouncementAcknowledgement"
    ADD CONSTRAINT "AnnouncementAcknowledgement_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AnnouncementEmailDelivery" (
  "id"                text        NOT NULL,
  "announcementId"    text        NOT NULL,
  "staffId"           text        NOT NULL,
  "email"             text        NOT NULL,
  "status"            text        NOT NULL DEFAULT 'QUEUED',
  "providerMessageId" text,
  "failureReason"     text,
  "sentAt"            timestamp(3),
  "createdAt"         timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         timestamp(3) NOT NULL,
  CONSTRAINT "AnnouncementEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementEmailDelivery_announcementId_staffId_key"
  ON "AnnouncementEmailDelivery" ("announcementId", "staffId");
CREATE INDEX IF NOT EXISTS "AnnouncementEmailDelivery_announcementId_idx"
  ON "AnnouncementEmailDelivery" ("announcementId");
CREATE INDEX IF NOT EXISTS "AnnouncementEmailDelivery_status_idx"
  ON "AnnouncementEmailDelivery" ("status");

DO $$ BEGIN
  ALTER TABLE "AnnouncementEmailDelivery"
    ADD CONSTRAINT "AnnouncementEmailDelivery_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "StaffAnnouncement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AnnouncementEmailDelivery"
    ADD CONSTRAINT "AnnouncementEmailDelivery_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Validation ───────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'AnnouncementAcknowledgement') AS ack_table,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'AnnouncementEmailDelivery')   AS email_table,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'AnnouncementAcknowledgement_announcementId_staffId_key') AS ack_unique,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'AnnouncementEmailDelivery_announcementId_staffId_key')   AS email_unique;
-- Expect: 1 | 1 | 1 | 1
