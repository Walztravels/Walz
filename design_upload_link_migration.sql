-- Design Team Upload Link
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS "DesignUploadLink" (
  "id"        TEXT        PRIMARY KEY,
  "token"     TEXT        NOT NULL UNIQUE,
  "label"     TEXT        NOT NULL DEFAULT 'Design team uploads',
  "createdBy" TEXT        NOT NULL,
  "isActive"  BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
