import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { stripe } from '@/lib/stripe'
import prisma from '@/lib/db'
import { sendBookingConfirmation, sendBookingNotificationToAdmin } from '@/lib/email'

/**
 * POST /api/booking/confirm
 *
 * Called after payment succeeds on the frontend.
 *
 * gateway: "flutterwave"  → Verifies transaction via Flutterwave API
 * gateway: "stripe"       → Retrieves and verifies the PaymentIntent via Stripe API
 *
 * After payment verification:
 *   1. Saves booking to the database
 *   2. Sends confirmation email to the client
 *   3. Sends full booking details to contact@walztravels.com
 *
 * Ticket issuance is handled manually by the team through Sabre GDS.
 */

const passengerSchema = z.object({
  type: z.enum(['ADT', 'CHD', 'INF']),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().min(1),
  gender: z.enum(['M', 'F']),
  passportNumber: z.string().optional().default(''),
  passportExpiry: z.string().optional().default(''),
  nationality: z.string().optional().default(''),
  email: z.string().optional(),
  phone: z.string().optional(),
})

const addonSchema = z.object({
  type: z.string(),
  description: z.string(),
  price: z.number(),
  currency: z.string(),
  selected: z.boolean(),
})

const schema = z.object({
  gateway: z.enum(['flutterwave', 'stripe']).default('flutterwave'),
  transactionId: z.string().optional(),    // required for flutterwave
  paymentIntentId: z.string().optional(),  // required for stripe
  bookingReference: z.string().min(4),
  passengers: z.array(passengerSchema).min(1),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  totalAmount: z.number().optional(),
  addons: z.array(addonSchema).optional().default([]),
  flight: z.object({
    duffelOfferId: z.string().optional(), // retained for search context only — not used for ticketing
    price: z.object({ amount: z.number(), currency: z.string() }),
    outbound: z.array(z.object({
      departureAirport: z.string(),
      arrivalAirport: z.string(),
      departureTime: z.string(),
      airline: z.string(),
      flightNumber: z.string(),
    })),
  }),
})

interface FlwVerification {
  status: string
  data: {
    status: string
    amount: number
    currency: string
    tx_ref: string
    id: number
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const data = parsed.data

  // ── Validate required ID fields per gateway ──────────────────────────────────
  if (data.gateway === 'flutterwave' && !data.transactionId) {
    return NextResponse.json({ error: 'transactionId is required for Flutterwave' }, { status: 400 })
  }
  if (data.gateway === 'stripe' && !data.paymentIntentId) {
    return NextResponse.json({ error: 'paymentIntentId is required for Stripe' }, { status: 400 })
  }

  try {
    // ── 1a. Verify Flutterwave transaction ──────────────────────────────────────
    if (data.gateway === 'flutterwave') {
      const flwRes = await fetch(
        `https://api.flutterwave.com/v3/transactions/${data.transactionId}/verify`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      )
      const flwData = await flwRes.json() as FlwVerification
      if (
        !flwRes.ok ||
        flwData.status !== 'success' ||
        flwData.data?.status !== 'successful'
      ) {
        return NextResponse.json(
          { error: 'Payment could not be verified. Please contact support.' },
          { status: 400 }
        )
      }
    }

    // ── 1b. Verify Stripe PaymentIntent ─────────────────────────────────────────
    if (data.gateway === 'stripe') {
      const intent = await stripe.paymentIntents.retrieve(data.paymentIntentId!)
      if (intent.status !== 'succeeded') {
        return NextResponse.json(
          { error: `Payment not completed (status: ${intent.status}). Please contact support.` },
          { status: 400 }
        )
      }
    }

    // ── 2. Save booking to database ──────────────────────────────────────────────
    const totalAmount = data.totalAmount ?? data.flight.price.amount
    const currency = data.flight.price.currency

    try {
      await prisma.booking.create({
        data: {
          bookingReference: data.bookingReference,
          pnr: data.bookingReference,   // updated to Sabre PNR once team issues ticket
          status: 'PENDING',
          paymentStatus: 'SUCCEEDED',
          totalAmount,
          currency,
          type: 'FLIGHT',
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone ?? null,
          stripePaymentIntentId: data.gateway === 'stripe' ? data.paymentIntentId : null,
          flightDetails: {
            outbound: data.flight.outbound,
            price: data.flight.price,
            ...(data.gateway === 'flutterwave' ? { flutterwaveTransactionId: data.transactionId } : {}),
          },
          passengers: data.passengers,
          addons: data.addons,
        },
      })
    } catch (dbErr) {
      console.error('[Booking Confirm] DB save failed (non-fatal):', dbErr)
    }

    // ── 3. Send emails ───────────────────────────────────────────────────────────
    const firstOutbound = data.flight.outbound[0]
    const flightEmailDetails = firstOutbound
      ? {
          origin: firstOutbound.departureAirport,
          destination: data.flight.outbound[data.flight.outbound.length - 1].arrivalAirport,
          departureDate: firstOutbound.departureTime,
          airline: firstOutbound.airline,
          flightNumber: firstOutbound.flightNumber,
        }
      : undefined

    try {
      await Promise.all([
        sendBookingConfirmation(
          {
            contactEmail: data.contactEmail,
            contactPhone: data.contactPhone,
            passengers: data.passengers as Parameters<typeof sendBookingConfirmation>[0]['passengers'],
            totalPrice: totalAmount,
            currency,
            type: 'FLIGHT',
            addons: data.addons as Parameters<typeof sendBookingConfirmation>[0]['addons'],
            flightDetails: flightEmailDetails,
          },
          data.bookingReference
        ),
        sendBookingNotificationToAdmin({
          bookingReference: data.bookingReference,
          pnr: data.bookingReference,
          gateway: data.gateway,
          flutterwaveTransactionId: data.transactionId,
          stripePaymentIntentId: data.paymentIntentId,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          passengers: data.passengers as Parameters<typeof sendBookingNotificationToAdmin>[0]['passengers'],
          totalPrice: totalAmount,
          currency,
          type: 'FLIGHT',
          addons: data.addons as Parameters<typeof sendBookingNotificationToAdmin>[0]['addons'],
          flightDetails: flightEmailDetails,
        }),
      ])
    } catch (emailErr) {
      console.error('[Booking Confirm] Email send failed (non-fatal):', emailErr)
    }

    // ── 4. Return success ────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      bookingReference: data.bookingReference,
      gateway: data.gateway,
      ...(data.gateway === 'flutterwave'
        ? { flutterwaveTransactionId: data.transactionId }
        : { stripePaymentIntentId: data.paymentIntentId }),
    })

  } catch (err) {
    console.error('[Booking Confirm] Error:', err)
    return NextResponse.json(
      {
        error:
          'An unexpected error occurred. Please contact support quoting your booking reference.',
      },
      { status: 500 }
    )
  }
}
