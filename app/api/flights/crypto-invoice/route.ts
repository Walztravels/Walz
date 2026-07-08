import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  amount:      z.number().positive(),
  currency:    z.string().length(3),
  ref:         z.string().min(1),
  description: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  const { amount, currency, ref, description } = parsed.data
  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'

  if (!process.env.NOWPAYMENTS_API_KEY) {
    return NextResponse.json({ error: 'Crypto payments not configured' }, { status: 500 })
  }

  const invoiceRes = await fetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST',
    headers: {
      'x-api-key':    process.env.NOWPAYMENTS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount:      amount,
      price_currency:    currency.toLowerCase(),
      order_id:          ref,
      order_description: description ?? 'Walz Travels: Flight booking',
      ipn_callback_url:  `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/nowpayments`,
      success_url:       `${origin}/flights/crypto-return?ref=${ref}`,
      cancel_url:        `${origin}/flights/checkout`,
    }),
  })

  const invoiceData = await invoiceRes.json()

  if (!invoiceRes.ok || !invoiceData.invoice_url) {
    console.error('[flights/crypto-invoice] NOWPayments error:', invoiceData)
    return NextResponse.json(
      { error: invoiceData.message || 'Failed to create crypto invoice' },
      { status: 500 },
    )
  }

  return NextResponse.json({ invoiceUrl: invoiceData.invoice_url })
}
