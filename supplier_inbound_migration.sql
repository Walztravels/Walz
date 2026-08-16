-- Supplier inbound reply tracking
-- Run in Supabase SQL Editor

ALTER TABLE "SupplierMessage" ADD COLUMN IF NOT EXISTS "resendMessageId" TEXT;
ALTER TABLE "SupplierMessage" ADD COLUMN IF NOT EXISTS "replySubject"    TEXT;
ALTER TABLE "SupplierMessage" ADD COLUMN IF NOT EXISTS "replyBody"       TEXT;

CREATE INDEX IF NOT EXISTS "SupplierMessage_resendMessageId_idx"
  ON "SupplierMessage" ("resendMessageId")
  WHERE "resendMessageId" IS NOT NULL;
