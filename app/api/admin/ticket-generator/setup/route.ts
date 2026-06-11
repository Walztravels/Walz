import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/ticket-generator/setup
 * Admin-only. Creates ticket_templates and generated_tickets tables,
 * then seeds default templates. Safe to run multiple times.
 */
export async function POST() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const statements: string[] = [
    // ── ticket_templates ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS ticket_templates (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      template_name TEXT        NOT NULL,
      template_type TEXT        NOT NULL,
      template_html TEXT        NOT NULL DEFAULT '',
      is_active     BOOLEAN     DEFAULT true,
      is_default    BOOLEAN     DEFAULT false,
      created_at    TIMESTAMPTZ DEFAULT now(),
      updated_at    TIMESTAMPTZ DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ticket_templates_type ON ticket_templates(template_type)`,

    // ── generated_tickets ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS generated_tickets (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_reference TEXT        UNIQUE NOT NULL,
      client_id        TEXT,
      client_name      TEXT,
      client_email     TEXT,
      ticket_type      TEXT        NOT NULL,
      ticket_data      JSONB       NOT NULL DEFAULT '{}',
      pdf_url          TEXT,
      sent_to_client   BOOLEAN     DEFAULT false,
      sent_at          TIMESTAMPTZ,
      created_by       TEXT,
      created_at       TIMESTAMPTZ DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_gen_tickets_email     ON generated_tickets(client_email)`,
    `CREATE INDEX IF NOT EXISTS idx_gen_tickets_type      ON generated_tickets(ticket_type)`,
    `CREATE INDEX IF NOT EXISTS idx_gen_tickets_created   ON generated_tickets(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_gen_tickets_client_id ON generated_tickets(client_id)`,

    // ── Seed default templates (skip if already exist) ───────────────────────
    `INSERT INTO ticket_templates (template_name, template_type, is_active, is_default, template_html)
     VALUES
       ('Flight Ticket',          'flight',   true, true, ''),
       ('Hotel Voucher',          'hotel',    true, true, ''),
       ('Tour Confirmation',      'tour',     true, true, ''),
       ('Transfer Voucher',       'transfer', true, true, ''),
       ('Visa Appointment',       'visa',     true, true, ''),
       ('Holiday Package',        'package',  true, true, '')
     ON CONFLICT DO NOTHING`,
  ]

  const errors: string[] = []
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(msg)
      console.error('[ticket-generator/setup]', msg)
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors }, { status: 500 })
  }
  return NextResponse.json({ success: true, message: 'Tables created and seeded.' })
}
