import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/insurance/setup
 * Admin-only. Creates insurance_quotes and insurance_orders tables
 * using raw SQL (same pattern as site_media — bypasses PostgREST schema cache).
 * Safe to call multiple times — uses CREATE TABLE IF NOT EXISTS.
 */
export async function POST() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const statements = [
    // ── insurance_quotes ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS insurance_quotes (
      id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      client_id           TEXT,
      trip_id             TEXT,
      battleface_quote_id TEXT,
      product_id          TEXT,
      plan_name           TEXT,
      premium             NUMERIC,
      currency            TEXT    DEFAULT 'USD',
      destination_country TEXT,
      origin_country      TEXT,
      trip_start_date     DATE,
      trip_end_date       DATE,
      travellers          JSONB   DEFAULT '[]',
      trip_cost           NUMERIC,
      quote_expires_at    TIMESTAMPTZ,
      coverage_details    JSONB   DEFAULT '{}',
      policy_wording_url  TEXT,
      raw_response        JSONB   DEFAULT '{}',
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ── insurance_orders ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS insurance_orders (
      id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      client_id             TEXT,
      trip_id               TEXT,
      battleface_order_id   TEXT UNIQUE,
      order_reference       TEXT,
      quote_id              TEXT REFERENCES insurance_quotes(id),
      plan_name             TEXT,
      status                TEXT    DEFAULT 'pending',
      premium               NUMERIC,
      currency              TEXT    DEFAULT 'USD',
      destination_country   TEXT,
      trip_start_date       DATE,
      trip_end_date         DATE,
      primary_traveller     JSONB,
      additional_travellers JSONB   DEFAULT '[]',
      policy_number         TEXT,
      policy_document_url   TEXT,
      stripe_payment_id     TEXT,
      raw_response          JSONB   DEFAULT '{}',
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ── Indexes ───────────────────────────────────────────────────────────────
    `CREATE INDEX IF NOT EXISTS ins_quotes_client_idx  ON insurance_quotes(client_id)`,
    `CREATE INDEX IF NOT EXISTS ins_quotes_trip_idx    ON insurance_quotes(trip_id)`,
    `CREATE INDEX IF NOT EXISTS ins_orders_client_idx  ON insurance_orders(client_id)`,
    `CREATE INDEX IF NOT EXISTS ins_orders_status_idx  ON insurance_orders(status)`,
    `CREATE INDEX IF NOT EXISTS ins_orders_trip_idx    ON insurance_orders(trip_id)`,
  ]

  const results: string[] = []
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql)
      const name = sql.match(/TABLE\s+(?:IF NOT EXISTS\s+)?(\S+)/i)?.[1]
              ?? sql.match(/INDEX\s+(?:IF NOT EXISTS\s+)?(\S+)/i)?.[1]
              ?? 'statement'
      results.push(`✓ ${name}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push(`✗ ${msg}`)
    }
  }

  return NextResponse.json({ success: true, results })
}
