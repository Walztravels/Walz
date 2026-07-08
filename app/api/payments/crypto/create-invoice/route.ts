import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const schema = z.object({
  // Tour booking details — mirrored from /api/tours/book
  tourId:       z.string().min(1),
  tourName:     z.string().min(1),
  tourSlug:     z.string().min(1),
  tourLocation: z.string().optional().default(''),
  date:         z.string().min(1),
  groupSize:    z.number().int().min(1),
  currency:     z.string().length(3),
  addons: z.array(z.object({ id: z.string(), name: z.string(), price: z.number() })),
  basePrice:    z.number().min(0),
  addonsTotal:  z.number().min(0),
  totalAmount:  z.number().min(0),
  firstName:    z.string().min(1),
  lastName:     z.string().min(1),
  email:        z.string().email(),
  whatsapp:     z.string().min(7),
  country:      z.string().min(1),
  requirements: z.string().optional().default(''),
  message:      z.string().optional().default(''),
})

function generateBookingRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let ref = 'WLZ-C-'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'

  // ── 1. Create a pending Booking record ────────────────────────────────────
  // Retry on reference collision (extremely unlikely but possible)
  let bookingReference = generateBookingRef()
  let attempts = 0
  while (attempts < 5) {
    const exists = await prisma.booking.findUnique({ where: { bookingReference }, select: { id: true } })
    if (!exists) break
    bookingReference = generateBookingRef()
    attempts++
  }

  const booking = await prisma.booking.create({
    data: {
      bookingReference,
      type:          'PACKAGE',
      status:        'PENDING',
      paymentStatus: 'PENDING',
      totalAmount:   d.totalAmount,
      currency:      d.currency,
      contactEmail:  d.email,
      contactPhone:  d.whatsapp,
      paymentProvider: 'nowpayments',
      hotelDetails: {
        type:        'tour',
        tourId:      d.tourId,
        tourName:    d.tourName,
        tourSlug:    d.tourSlug,
        tourLocation: d.tourLocation,
        date:        d.date,
        groupSize:   d.groupSize,
        basePrice:   d.basePrice,
        addonsTotal: d.addonsTotal,
      },
      passengers: [{
        firstName:    d.firstName,
        lastName:     d.lastName,
        email:        d.email,
        whatsapp:     d.whatsapp,
        country:      d.country,
        requirements: d.requirements,
        message:      d.message,
      }],
      addons: d.addons.map(a => ({
        id: a.id, name: a.name, price: a.price,
        currency: d.currency, selected: true, description: a.name,
      })),
      notes: `NOWPayments crypto invoice pending`,
    },
  })

  // ── 2. Create NOWPayments hosted invoice ──────────────────────────────────
  const invoiceRes = await fetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST',
    headers: {
      'x-api-key':    process.env.NOWPAYMENTS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount:       d.totalAmount,
      price_currency:     d.currency.toLowerCase(),
      // pay_currency intentionally omitted — lets customer choose USDC or USDT
      // on NOWPayments' hosted page
      order_id:           bookingReference,
      order_description:  `Walz Travels: ${d.tourName} (${d.groupSize} person${d.groupSize > 1 ? 's' : ''}, ${d.date})`,
      ipn_callback_url:   `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/nowpayments`,
      success_url:        `${origin}/tours/book/crypto-return?ref=${bookingReference}`,
      cancel_url:         `${origin}/tours/book?slug=${d.tourSlug}`,
    }),
  })

  const invoiceData = await invoiceRes.json()

  if (!invoiceRes.ok || !invoiceData.invoice_url) {
    // Roll back the pending booking so it doesn't linger
    await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {})
    console.error('[NOWPayments] Invoice creation failed:', invoiceData)
    return NextResponse.json(
      { error: invoiceData.message || 'Failed to create crypto invoice' },
      { status: 500 }
    )
  }

  // ── 3. Store the invoice ID against the booking ───────────────────────────
  await prisma.booking.update({
    where: { id: booking.id },
    data:  { cryptoInvoiceId: String(invoiceData.id) },
  })

  return NextResponse.json({
    invoiceUrl:        invoiceData.invoice_url,
    bookingReference,
  })
}
