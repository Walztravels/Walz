import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { createStripePaymentIntent } from '@/lib/stripe'
import { generateBookingReference } from '@/lib/utils'

const schema = z.object({
  slug: z.string().min(1),
  paymentType: z.enum(['deposit', 'full']),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  travelers: z.number().int().min(1).max(20),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

    const pkg = await prisma.tourListing.findUnique({ where: { slug: data.slug } })
    if (!pkg || !pkg.active) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }

    const fullAmount = pkg.price * data.travelers
    const depositAmount = Math.ceil(fullAmount * 0.3)
    const amount = data.paymentType === 'deposit' ? depositAmount : fullAmount
    const currency = pkg.currency.toLowerCase()

    const bookingRef = generateBookingReference()

    const intent = await createStripePaymentIntent({
      amount,
      currency,
      metadata: {
        bookingReference: bookingRef,
        packageSlug: pkg.slug,
        packageName: pkg.name,
        paymentType: data.paymentType,
        travelers: String(data.travelers),
        contactEmail: data.email,
        contactName: data.name,
      },
    })

    await prisma.booking.create({
      data: {
        bookingReference: bookingRef,
        type: 'PACKAGE',
        status: 'PENDING',
        paymentStatus: 'PENDING',
        totalAmount: amount,
        currency: pkg.currency,
        contactEmail: data.email,
        contactPhone: data.phone,
        stripePaymentIntentId: intent.id,
        stripeClientSecret: intent.client_secret ?? '',
        addons: {
          packageSlug: pkg.slug,
          packageName: pkg.name,
          paymentType: data.paymentType,
          travelers: data.travelers,
          fullAmount,
          depositAmount,
          contactName: data.name,
        },
      },
    })

    return NextResponse.json({
      clientSecret: intent.client_secret,
      bookingReference: bookingRef,
      amount,
      currency: pkg.currency,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 })
    }
    console.error('[packages/checkout]', err)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}
