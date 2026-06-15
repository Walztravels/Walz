import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  try {
    const session = await stripe.checkout.sessions.retrieve(id)
    return NextResponse.json({
      id:            session.id,
      status:        session.payment_status,
      customerEmail: session.customer_email,
      amountTotal:   session.amount_total,
      currency:      session.currency,
      metadata:      session.metadata,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
