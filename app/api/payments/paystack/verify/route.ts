import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PS_BASE = 'https://api.paystack.co'

export async function POST(req: NextRequest) {
  try {
    const PS_SECRET = process.env.PAYSTACK_SECRET_KEY
    if (!PS_SECRET) {
      return NextResponse.json({ error: 'Paystack not configured' }, { status: 500 })
    }

    const { reference, expected_amount, expected_currency } = await req.json() as {
      reference:          string
      expected_amount?:   number
      expected_currency?: string
    }

    if (!reference) {
      return NextResponse.json({ error: 'reference is required' }, { status: 400 })
    }

    const res  = await fetch(`${PS_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PS_SECRET}` },
    })
    const data = await res.json()

    if (!data.status || data.data?.status !== 'success') {
      return NextResponse.json(
        { verified: false, error: 'Payment not successful', status: data.data?.status },
        { status: 400 },
      )
    }

    // Use != null (not &&) so that zero values still trigger the check
    if (expected_amount != null && data.data.amount < Math.round(Number(expected_amount) * 100)) {
      return NextResponse.json({ verified: false, error: 'Amount mismatch' }, { status: 400 })
    }

    if (expected_currency != null && data.data.currency !== expected_currency) {
      return NextResponse.json({ verified: false, error: 'Currency mismatch' }, { status: 400 })
    }

    return NextResponse.json({
      verified:   true,
      reference,
      amount:     data.data.amount / 100,
      currency:   data.data.currency,
      channel:    data.data.channel,
      paidAt:     data.data.paid_at,
      customerId: data.data.customer?.customer_code ?? null,
    })
  } catch (err: unknown) {
    console.error('[ps-verify] ERROR:', (err as Error).message)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
