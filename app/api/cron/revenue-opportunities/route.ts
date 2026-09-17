import { NextRequest, NextResponse } from 'next/server'
import { generateRevenueOpportunities } from '@/lib/intelligence/revenue-rules'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * INT-5 — scheduled revenue-opportunity detection.
 *
 * Runs the deterministic rules engine (visa-approved-no-flight, quote
 * follow-ups, trip composition gaps, premium itineraries). Idempotent
 * via dedupeKey: re-runs skip existing opportunities instead of
 * duplicating them. Detection only — nothing here contacts a client.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await generateRevenueOpportunities()
  return NextResponse.json({ ok: true, ...result })
}
