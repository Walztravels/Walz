-- Migration: add offline-notification tracking fields
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- 1. last_active_at on staff
--    Updated (throttled, 2-min gap) on every authenticated admin request.
--    Null = staff member has never loaded an admin page since this migration.
ALTER TABLE "Staff"
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- 2. last_offline_notified_at on "Lead"
--    Stamped when an offline-staff alert email is sent for this lead.
--    Used to suppress duplicate alerts within the 30-minute dedup window.
ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS last_offline_notified_at TIMESTAMPTZ;

-- No RLS changes needed — both columns are written only by server-side API
-- routes that already have service-role access.
