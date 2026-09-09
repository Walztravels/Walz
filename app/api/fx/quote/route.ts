import { NextRequest, NextResponse } from 'next/server'
import {
  isNgnFxEngineEnabled,
  createNgnQuote,
  quoteToJson,
  NgnRateUnavailableError,
  NGN_RATE_UNAVAILABLE,
  NGN_RATE_UNAVAILABLE_MESSAGE,
  WALZ_NGN_RATE_LABEL,
} from '@/lib/fx'

export const dynamic = 'force-dynamic'

/**
 * GET /api/fx/quote?base=USD&amount=2300
 *
 * Indicative customer-facing NGN estimate from the central FX engine —
 * DISPLAY_ESTIMATE context: computed exactly like checkout (single USD
 * adjustment included) but never persisted and never chargeable. Payment
 * amounts always come from a server-side CHECKOUT rate lock instead.
 *
 * Returns { available: false } when the engine flag is off so callers can
 * keep their existing display behavior.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const base   = (searchParams.get('base') ?? 'USD').toUpperCase()
  const amount = Number(searchParams.get('amount') ?? '1')

  if (!isNgnFxEngineEnabled()) {
    return NextResponse.json({ available: false })
  }
  if (!/^[A-Z]{3}$/.test(base) || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    return NextResponse.json({ error: 'base and a positive amount are required' }, { status: 400 })
  }

  try {
    const q = await createNgnQuote({
      baseCurrency: base,
      baseAmount:   amount,
      context:      'DISPLAY_ESTIMATE',
    })
    return NextResponse.json({
      available: true,
      rateLabel: WALZ_NGN_RATE_LABEL,
      quote:     quoteToJson(q),
    })
  } catch (err) {
    if (err instanceof NgnRateUnavailableError) {
      return NextResponse.json(
        { available: false, code: NGN_RATE_UNAVAILABLE, message: NGN_RATE_UNAVAILABLE_MESSAGE },
        { status: 503 },
      )
    }
    console.error('[fx/quote] error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { available: false, code: NGN_RATE_UNAVAILABLE, message: NGN_RATE_UNAVAILABLE_MESSAGE },
      { status: 503 },
    )
  }
}
