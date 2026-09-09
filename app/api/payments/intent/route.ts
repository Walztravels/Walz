import { NextRequest, NextResponse } from 'next/server'
import {
  createFlightPaymentIntent,
  createPackagePaymentIntent,
  createTourPaymentIntent,
  PaymentAuthorityError,
} from '@/lib/payments/authority'

export const dynamic = 'force-dynamic'

/**
 * POST /api/payments/intent
 *
 * Server-authoritative payment snapshot. The browser sends IDENTIFIERS
 * (offer id, booking ref, tour id + selections) — the server derives the
 * amount from authoritative records, persists it as a PaymentLink intent,
 * and returns { txRef, amount, currency }. Provider flows must charge with
 * this txRef; fulfilment reconciles the provider-verified transaction
 * against the snapshot. Browser-supplied money fields are never read.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.kind !== 'string') {
    return NextResponse.json({ error: 'kind is required' }, { status: 400 })
  }

  try {
    if (body.kind === 'flight') {
      const intent = await createFlightPaymentIntent({
        offerId:        String(body.offerId ?? ''),
        chargeCurrency: String(body.chargeCurrency ?? 'GBP'),
        fxLockId:       body.fxLockId ? String(body.fxLockId) : null,
        seatsTotal:     Number(body.seatsTotal)  || 0,
        extrasTotal:    Number(body.extrasTotal) || 0,
        discountGBP:    Number(body.discountGBP) || 0,
        clientEmail:    body.clientEmail ? String(body.clientEmail) : null,
        clientName:     body.clientName  ? String(body.clientName)  : null,
      })
      return NextResponse.json({ intent })
    }

    if (body.kind === 'package') {
      const intent = await createPackagePaymentIntent({
        bookingRef:  String(body.bookingRef ?? ''),
        payCurrency: String(body.payCurrency ?? ''),
      })
      return NextResponse.json({ intent })
    }

    if (body.kind === 'tour') {
      const intent = await createTourPaymentIntent({
        tourId:      String(body.tourId ?? ''),
        groupSize:   Number(body.groupSize) || 0,
        addonIds:    Array.isArray(body.addonIds) ? body.addonIds.map(String) : [],
        clientEmail: body.clientEmail ? String(body.clientEmail) : null,
        clientName:  body.clientName  ? String(body.clientName)  : null,
      })
      return NextResponse.json({ intent })
    }

    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })
  } catch (err) {
    if (err instanceof PaymentAuthorityError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    if (err instanceof Error && err.name === 'TourPricingError') {
      const status = (err as Error & { status?: number }).status ?? 400
      return NextResponse.json({ error: err.message }, { status })
    }
    console.error('[payments/intent]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not prepare payment. Please try again.' }, { status: 500 })
  }
}
