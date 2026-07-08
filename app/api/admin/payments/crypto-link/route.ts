import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { prisma }                    from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const { amount, currency, description, clientEmail, bookingId } = body as {
    amount:       number
    currency?:    string
    description?: string
    clientEmail?: string
    bookingId?:   string
  }

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Valid amount required' }, { status: 400 })
  }

  const priceCurrency = (currency || 'USD').toLowerCase()
  const orderId       = bookingId || `ADHOC-${Date.now()}`
  const orderDesc     = description || 'Walz Travels payment'

  // Create NOWPayments hosted invoice — pay_currency intentionally omitted
  // so the customer selects their preferred crypto on NOWPayments' hosted page.
  const npRes = await fetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST',
    headers: {
      'x-api-key':    process.env.NOWPAYMENTS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount:      amount,
      price_currency:    priceCurrency,
      order_id:          orderId,
      order_description: orderDesc,
      ipn_callback_url:  `${APP_URL}/api/webhooks/nowpayments`,
      success_url:       `${APP_URL}/payment/success`,
      cancel_url:        `${APP_URL}/payment/failed`,
    }),
  })

  const data = await npRes.json()

  if (!npRes.ok || !data.invoice_url) {
    console.error('[crypto-link] NOWPayments error:', data)
    return NextResponse.json(
      { error: data.message || 'Failed to create crypto payment link' },
      { status: 500 }
    )
  }

  // Persist for audit trail + webhook status updates
  await prisma.adminPaymentLink.create({
    data: {
      invoiceId:   String(data.id),
      orderId,
      invoiceUrl:  data.invoice_url,
      amount,
      currency:    currency || 'USD',
      description: description || null,
      clientEmail: clientEmail || null,
      bookingId:   bookingId || null,
      status:      'pending',
      createdBy:   session.email,
    },
  }).catch(err => console.error('[crypto-link] DB save failed:', err))

  const displayCurrency = (currency || 'USD').toUpperCase()
  const waText = encodeURIComponent(
    `Hi! Here's your Walz Travels payment link — you can pay with any cryptocurrency (Bitcoin, USDC, USDT and more):\n\n${data.invoice_url}\n\nAmount: $${amount} ${displayCurrency}${description ? `\nRef: ${description}` : ''}\n\nPlease complete payment at your earliest convenience. Contact us if you need any help.`
  )

  return NextResponse.json({
    invoiceUrl: data.invoice_url,
    waShareUrl: `https://wa.me/?text=${waText}`,
    orderId,
  })
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const links = await prisma.adminPaymentLink.findMany({
    orderBy: { createdAt: 'desc' },
    take:    100,
  })

  return NextResponse.json({ links })
}
