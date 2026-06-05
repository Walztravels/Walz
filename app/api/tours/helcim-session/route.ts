import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { initializeHelcimCheckout } from '@/lib/helcim'

const schema = z.object({
  tourId:       z.string().min(1),
  tourName:     z.string().min(1),
  tourSlug:     z.string().min(1),
  date:         z.string().min(1),
  groupSize:    z.number().int().min(1),
  currency:     z.string().length(3),
  totalAmount:  z.number().min(0),
  firstName:    z.string().min(1),
  lastName:     z.string().min(1),
  email:        z.string().email(),
  addons:       z.array(z.object({ id: z.string(), name: z.string(), price: z.number() })).optional().default([]),
})

/**
 * POST /api/tours/helcim-session
 *
 * Initialises a Helcim Pay checkout session for a tour booking.
 * Returns { checkoutToken, secretToken } for the frontend to mount HelcimPay.js.
 * After payment, the frontend calls /api/tours/helcim-verify to confirm the booking.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
    }

    const d = parsed.data
    // Use tourSlug + timestamp as invoice number for traceability
    const invoiceNumber = `TOUR-${d.tourSlug.slice(0, 20).toUpperCase()}-${Date.now()}`

    const session = await initializeHelcimCheckout({
      amount:        d.totalAmount,
      currency:      d.currency,
      invoiceNumber,
    })

    return NextResponse.json({
      checkoutToken:  session.checkoutToken,
      secretToken:    session.secretToken,
      invoiceNumber,
    })
  } catch (err) {
    console.error('[Helcim Tour Session]', err)
    return NextResponse.json({ error: 'Failed to create Helcim checkout session' }, { status: 500 })
  }
}
