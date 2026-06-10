import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ── Validation schema ─────────────────────────────────────────────────────────

const schema = z.object({
  trip_start_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  trip_end_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  destination_country: z.string().length(2),
  origin_country:      z.string().length(2).default('GB'),
  travellers: z.array(z.object({
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    is_primary:    z.boolean(),
  })).min(1).max(9),
  trip_cost: z.number().positive().optional(),
  currency:  z.string().length(3).default('USD'),
})

function bfHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${process.env.BATTLEFACE_BEARER_TOKEN}`,
  }
}

/**
 * POST /api/insurance/quote
 * Open — no auth required (auth optional, used to link quote to user).
 * Creates a Battleface quote and stores it in insurance_quotes.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null)

  const body   = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const d       = parsed.data
  const baseUrl = process.env.BATTLEFACE_API_URL
  if (!baseUrl || !process.env.BATTLEFACE_BEARER_TOKEN) {
    return NextResponse.json({ error: 'Insurance API not configured' }, { status: 503 })
  }

  // ── Call Battleface ────────────────────────────────────────────────────────
  let bfData: Record<string, unknown> = {}
  try {
    const bfRes = await fetch(`${baseUrl}/quotes`, {
      method:  'POST',
      headers: bfHeaders(),
      body: JSON.stringify({
        trip_start_date:     d.trip_start_date,
        trip_end_date:       d.trip_end_date,
        destination_country: d.destination_country,
        origin_country:      d.origin_country,
        travellers:          d.travellers,
        ...(d.trip_cost ? { trip_cost: d.trip_cost } : {}),
        currency:            d.currency,
      }),
    })

    if (!bfRes.ok) {
      const txt = await bfRes.text()
      console.error('[POST /api/insurance/quote] bf error:', bfRes.status, txt)
      return NextResponse.json(
        { error: 'Quote service is temporarily unavailable. Please try again shortly.' },
        { status: 502 },
      )
    }

    bfData = await bfRes.json()
  } catch (err) {
    console.error('[POST /api/insurance/quote] fetch error:', err)
    return NextResponse.json(
      { error: 'Could not reach insurance provider. Please try again.' },
      { status: 502 },
    )
  }

  // ── Normalise response fields (handles various bf field name conventions) ──
  const bfQuoteId  = (bfData.quote_id ?? bfData.id ?? null) as string | null
  const bfProductId = (bfData.product_id ?? bfData.productId ?? null) as string | null
  const premium    = Number(bfData.premium ?? bfData.total_premium ?? bfData.amount ?? 0)
  const planName   = String(bfData.plan_name ?? bfData.product_name ?? bfData.name ?? 'Walz Travel Shield')
  const policyUrl  = (bfData.policy_wording_url ?? bfData.wording_url ?? null) as string | null
  const coverage   = (bfData.coverage_details ?? bfData.coverage ?? bfData.benefits ?? {}) as object
  const expiresAt  = new Date(Date.now() + 30 * 60 * 1000)

  // ── Persist quote ──────────────────────────────────────────────────────────
  let quoteDbId: string | null = null
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
      INSERT INTO insurance_quotes (
        client_id, battleface_quote_id, product_id, plan_name,
        premium, currency,
        destination_country, origin_country,
        trip_start_date, trip_end_date,
        travellers, trip_cost,
        quote_expires_at, coverage_details, policy_wording_url, raw_response
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8,
        $9::date, $10::date,
        $11::jsonb, $12,
        $13, $14::jsonb, $15, $16::jsonb
      ) RETURNING id
    `,
      session?.user?.id    ?? null,
      bfQuoteId,
      bfProductId,
      planName,
      premium,
      d.currency,
      d.destination_country,
      d.origin_country,
      d.trip_start_date,
      d.trip_end_date,
      JSON.stringify(d.travellers),
      d.trip_cost ?? null,
      expiresAt.toISOString(),
      JSON.stringify(coverage),
      policyUrl,
      JSON.stringify(bfData),
    )
    quoteDbId = rows[0]?.id ?? null
  } catch (err) {
    // Non-fatal — DB persistence failure doesn't block the user
    console.error('[POST /api/insurance/quote] DB write error:', err)
  }

  return NextResponse.json({
    quote_id:            quoteDbId,
    battleface_quote_id: bfQuoteId,
    product_id:          bfProductId,
    plan_name:           planName,
    premium,
    currency:            (bfData.currency as string | undefined) ?? d.currency,
    coverage_details:    coverage,
    policy_wording_url:  policyUrl,
    expires_at:          expiresAt.toISOString(),
  })
}
