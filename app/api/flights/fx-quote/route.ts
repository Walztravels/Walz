import { NextRequest, NextResponse } from 'next/server'
import { getFxQuote } from '@/lib/payments/fx'
import {
  isNgnFxEngineEnabled,
  createNgnQuote,
  NgnRateUnavailableError,
  NGN_RATE_UNAVAILABLE,
  NGN_RATE_UNAVAILABLE_MESSAGE,
  WALZ_NGN_RATE_LABEL,
} from '@/lib/fx'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from   = (searchParams.get('from')   ?? 'GBP').toUpperCase()
  const to     = (searchParams.get('to')     ?? 'NGN').toUpperCase()
  const amount = Number(searchParams.get('amount') ?? 1320)

  if (!from || !to || isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'from, to, and amount are required' }, { status: 400 })
  }

  // ── Central Walz FX engine (flag-gated) — customer-facing NGN pricing ──────
  // Monierate parallel → manual fallback → fail closed, plus the single USD
  // adjustment applied ONCE to this conversion total. The quote is persisted
  // as a CHECKOUT rate lock so payment initialisation reuses these exact
  // numbers server-side (the browser total is never trusted).
  if (to === 'NGN' && isNgnFxEngineEnabled()) {
    try {
      const q = await createNgnQuote({
        baseCurrency: from,
        baseAmount:   amount,
        context:      'CHECKOUT',
        reference:    'flights-checkout',
      })
      return NextResponse.json({
        available: true,
        quote: {
          // Legacy shape the checkout UI already renders
          from,
          to:         'NGN',
          rate:       q.rawRate.toNumber(),
          marginRate: q.effectiveRate.toNumber(),
          amountFrom: amount,
          amountTo:   q.convertedAmount.toNumber(),
          source:     'walz-fx',
          fetchedAt:  q.fetchedAt,
          // Engine extras — presence of lockId signals the new flow
          engine:            true,
          lockId:            q.lockId,
          expiresAt:         q.expiresAt,
          rateSource:        q.rateSource,
          rateLabel:         WALZ_NGN_RATE_LABEL,
          adjustmentUsd:     q.adjustmentUsd.toNumber(),
          adjustmentInBase:  q.adjustmentInBaseCurrency.toNumber(),
          adjustedBase:      q.adjustedBaseAmount.toNumber(),
        },
      })
    } catch (err) {
      if (err instanceof NgnRateUnavailableError) {
        // Fail closed: no official-rate fallback, no legacy-margin fallback.
        return NextResponse.json(
          { available: false, code: NGN_RATE_UNAVAILABLE, message: NGN_RATE_UNAVAILABLE_MESSAGE },
          { status: 503 },
        )
      }
      console.error('[fx-quote] engine error:', err instanceof Error ? err.message : err)
      return NextResponse.json(
        { available: false, code: NGN_RATE_UNAVAILABLE, message: NGN_RATE_UNAVAILABLE_MESSAGE },
        { status: 503 },
      )
    }
  }

  // ── Legacy path (flag off, or non-NGN target) — existing behavior ─────────
  const quote = await getFxQuote(from, to, amount)
  if (!quote) {
    return NextResponse.json({ available: false }, { status: 200 })
  }

  return NextResponse.json({ available: true, quote })
}
