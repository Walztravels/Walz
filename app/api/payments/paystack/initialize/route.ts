import { NextRequest, NextResponse } from 'next/server'
import { prisma }                   from '@/lib/db'
import { isNgnFxEngineEnabled, loadFxLock, markFxLockUsed } from '@/lib/fx'

export const dynamic = 'force-dynamic'

const PS_BASE = 'https://api.paystack.co'

export async function POST(req: NextRequest) {
  try {
    const PS_SECRET = process.env.PAYSTACK_SECRET_KEY
    if (!PS_SECRET) {
      return NextResponse.json({ error: 'Paystack not configured' }, { status: 500 })
    }

    let {
      email,
      amount,
      currency     = 'NGN',
      bookingRef,
      callbackUrl,
      metadata: extraMeta,
      // FX fields — present when client is paying in a converted currency
      fareCurrency,
      fareAmount,
      fxRate,
      fxMargin,
      fxSource,
      fxQuotedAt,
      // Central FX engine rate-lock id (server-authoritative NGN amount)
      fxLockId,
    } = await req.json() as {
      email:          string
      amount:         number
      currency?:      string
      bookingRef?:    string
      callbackUrl?:   string
      metadata?:      Record<string, unknown>
      fareCurrency?:  string
      fareAmount?:    number
      fxRate?:        number
      fxMargin?:      number
      fxSource?:      string
      fxQuotedAt?:    string
      fxLockId?:      string
    }

    if (!email || !amount) {
      return NextResponse.json({ error: 'email and amount are required' }, { status: 400 })
    }

    // ── Central FX engine: the server is price authority for NGN ──────────────
    // When a rate lock accompanies an NGN charge, EVERY browser-supplied FX
    // value is discarded and replaced with the locked server-side quote. An
    // expired lock is a 409 — the client must revalidate and show the price
    // change; the amount is never silently altered.
    if (isNgnFxEngineEnabled() && currency.toUpperCase() === 'NGN' && fxLockId) {
      const lock = await loadFxLock(fxLockId)
      if (!lock || lock.quoteCurrency !== 'NGN') {
        return NextResponse.json({ error: 'Invalid FX quote reference' }, { status: 400 })
      }
      if (lock.expired) {
        return NextResponse.json(
          { error: 'FX_QUOTE_EXPIRED', message: 'Exchange rate expired. Please refresh your total before paying.' },
          { status: 409 },
        )
      }
      amount       = lock.convertedAmount.toNumber()
      fareCurrency = lock.baseCurrency
      fareAmount   = lock.baseAmount.toNumber()
      fxRate       = lock.rawRate.toNumber()
      // Adjustment is separate from the rate; recorded via source tag + lock audit row.
      fxMargin     = undefined
      fxSource     = `walz-fx:${lock.rateSource}`
      fxQuotedAt   = lock.createdAt.toISOString()
      await markFxLockUsed(lock.id)
    }

    const { randomBytes: _rb } = require('crypto') as typeof import('crypto')
    const txRef = `WALZ-PS-${Date.now()}-${_rb(4).toString('hex').toUpperCase()}`
    // Paystack requires amount in minor units (kobo for NGN, pesewas for GHS, etc.)
    const amountMinor = Math.round(Number(amount) * 100)

    const res  = await fetch(`${PS_BASE}/transaction/initialize`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${PS_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount:    amountMinor,
        currency,
        reference: txRef,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        metadata: {
          walz_tx_ref: txRef,
          ...(bookingRef ? { booking_ref: bookingRef } : {}),
          ...extraMeta,
        },
      }),
    })
    const data = await res.json()

    console.log('[ps-init]', { status: data.status, message: data.message, ref: txRef, currency, amount })

    if (!data.status || !data.data?.authorization_url) {
      return NextResponse.json(
        { error: data.message || 'Failed to initialise Paystack transaction', details: data },
        { status: 400 },
      )
    }

    try {
      await prisma.paymentLink.create({
        data: {
          txRef,
          paymentUrl:    data.data.authorization_url,
          amount:        Number(amount),
          currency,
          clientEmail:   email,
          clientName:    '',
          description:   bookingRef ? `Booking ${bookingRef}` : 'Paystack checkout',
          type:          'paystack',
          provider:      'paystack',
          status:        'pending',
          // FX tracking
          ...(fareCurrency  ? { fareCurrency  }                          : {}),
          ...(fareAmount    ? { fareAmount:   fareAmount                  } : {}),
          chargeCurrency:    currency,
          chargeAmount:      Number(amount),
          ...(fxRate        ? { fxRate:       fxRate                      } : {}),
          ...(fxMargin      ? { fxMargin:     fxMargin                    } : {}),
          ...(fxSource      ? { fxSource                                  } : {}),
          ...(fxQuotedAt    ? { fxQuotedAt:   new Date(fxQuotedAt)       } : {}),
        },
      })
    } catch (dbErr: unknown) {
      console.warn('[ps-init] PaymentLink save skipped:', (dbErr as Error).message)
    }

    return NextResponse.json({
      success:   true,
      url:       data.data.authorization_url,
      reference: txRef,
      amount:    Number(amount),
      currency,
    })
  } catch (err: unknown) {
    console.error('[ps-init] ERROR:', (err as Error).message)
    return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 })
  }
}
