-- ============================================================
-- Walz Travels CRM Inbox — Phase 1 Migration
-- Run this in Supabase SQL Editor (once)
-- ============================================================

-- 1. messages table
-- lead_id is TEXT (not uuid) because leads.id is a Prisma CUID
CREATE TABLE IF NOT EXISTS messages (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      text    REFERENCES leads(id) ON DELETE SET NULL,
  staff_id     text,
  channel      text    NOT NULL DEFAULT 'whatsapp',
  -- whatsapp | instagram | email | webchat
  direction    text    NOT NULL DEFAULT 'inbound',
  -- inbound (customer) | outbound (staff/jade)
  body         text    NOT NULL,
  attachments  jsonb   DEFAULT '[]',
  -- [{type, url, filename, mime_type, media_id}]
  external_id  text,
  -- WhatsApp wamid / Meta message ID — used to prevent duplicates
  read_at      timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_lead_id           ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_external_id       ON messages(external_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at        ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_channel_direction ON messages(channel, direction);

-- 2. Extra columns on leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS whatsapp_number     text,
  ADD COLUMN IF NOT EXISTS instagram_handle    text,
  ADD COLUMN IF NOT EXISTS last_message_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS unread_count        int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_staff_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS jade_last_reply_at  timestamptz;

-- 3. message_templates table
CREATE TABLE IF NOT EXISTS message_templates (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text  NOT NULL,
  body        text  NOT NULL,
  channel     text  DEFAULT 'whatsapp',
  created_by  text,
  created_at  timestamptz DEFAULT now()
);

INSERT INTO message_templates (title, body) VALUES
  ('Visa Enquiry Response',
   'Hi! Thank you for reaching out to Walz Travels. I''d be happy to help with your visa application. Could you let me know which country you''re applying for and your planned travel date?'),
  ('Flight Quote Request',
   'Hi! Thanks for contacting Walz Travels. To find the best flight for you, could you share your departure city, destination, travel dates and how many passengers?'),
  ('Package Interest',
   'Hi! Thanks for your interest in our travel packages. Which destination are you interested in? We have amazing packages to Dubai, London, Toronto, Paris and more — all inclusive of flights, hotel and activities.'),
  ('Booking Confirmation',
   'Great news! Your booking with Walz Travels has been confirmed. You will receive your full booking details and invoice by email shortly. Please don''t hesitate to reach out if you have any questions.'),
  ('Document Checklist',
   'Hi! To process your visa application, we will need the following documents: valid passport (6+ months), passport photos, bank statement (3 months), employment letter, travel insurance. Please WhatsApp them to us and we will take care of the rest!'),
  ('Payment Link',
   'Hi! To confirm your reservation, please complete your deposit payment using the secure link below. Once paid, your seats will be held for you. Let us know if you have any questions!')
ON CONFLICT DO NOTHING;

-- 4. Row-Level Security — permissive read so anon key can subscribe via Realtime
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inbox_read_all"  ON messages;
DROP POLICY IF EXISTS "inbox_write_all" ON messages;
CREATE POLICY "inbox_read_all"  ON messages FOR SELECT USING (true);
CREATE POLICY "inbox_write_all" ON messages FOR ALL    USING (true) WITH CHECK (true);

-- 5. Enable Supabase Realtime
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE leads    REPLICA IDENTITY FULL;

-- Add to realtime publication (idempotent-ish; ignore "already member" errors)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE leads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
