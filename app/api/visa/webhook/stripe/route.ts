import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent } from '@/lib/stripe'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature') ?? ''

  let event: import('stripe').Stripe.Event
  try {
    event = await constructWebhookEvent(body, sig)
  } catch (err) {
    console.error('[Stripe Webhook] Invalid signature:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as import('stripe').Stripe.Checkout.Session
    const appId   = session.metadata?.applicationId
    if (appId) {
      await prisma.visaApplication.update({
        where: { id: appId },
        data:  { serviceFeePaid: true, status: 'documents_pending' },
      })
      console.log('[Stripe] Payment confirmed for application:', appId)
    }
  }

  return NextResponse.json({ received: true })
}
