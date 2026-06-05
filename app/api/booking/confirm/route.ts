import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelGet, duffelPostWithRetry, DuffelApiError } from '@/lib/duffel/client'
import { stripe } from '@/lib/stripe'
import prisma from '@/lib/db'
import { sendBookingConfirmation, sendBookingNotificationToAdmin } from '@/lib/email'

/**
 * POST /api/booking/confirm
 *
 * Called after payment succeeds on the frontend.
 *
 * gateway: "flutterwave"
 *   → Verifies the transaction server-side via Flutterwave API
 *
 * gateway: "stripe"
 *   → Retrieves and verifies the PaymentIntent via Stripe API
 *
 * After verification:
 *   1. Creates a Duffel order (if offer ID present)
 *   2. Saves booking to the database with status PENDING
 *   3. Sends confirmation email to the client
 *   4. Sends admin notification to contact@walztravels.com
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
  serviceFee: z.number().optional(),
  addons: z.array(addonSchema).optional().default([]),
  flight: z.object({
    duffelOfferId: z.string().optional(),
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

interface DuffelOffer {
  data: {
    passengers: { id: string; type?: string; age?: number }[]
    total_amount: string
    total_currency: string
  }
}

interface DuffelOrder {
  data: {
    id: string
    booking_reference: string
    documents?: { type: string; unique_identifier: string }[]
  }
}

function toTitle(gender: string): string {
  return gender === 'F' ? 'ms' : 'mr'
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

  // ── Validate required ID fields per gateway ────────────────────────────────
  if (data.gateway === 'flutterwave' && !data.transactionId) {
    return NextResponse.json({ error: 'transactionId is required for Flutterwave' }, { status: 400 })
  }
  if (data.gateway === 'stripe' && !data.paymentIntentId) {
    return NextResponse.json({ error: 'paymentIntentId is required for Stripe' }, { status: 400 })
  }

  try {
    // ── 1a. Verify Flutterwave transaction ────────────────────────────────────
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

    // ── 1b. Verify Stripe PaymentIntent ───────────────────────────────────────
    if (data.gateway === 'stripe') {
      const intent = await stripe.paymentIntents.retrieve(data.paymentIntentId!)
      if (intent.status !== 'succeeded') {
        return NextResponse.json(
          { error: `Payment not completed (status: ${intent.status}). Please contact support.` },
          { status: 400 }
        )
      }
    }

    // ── 2. Book via Duffel if offer ID is present ─────────────────────────────
    let airlinePnr: string = data.bookingReference

    if (data.flight.duffelOfferId) {
      const offerId = data.flight.duffelOfferId

      // Get offer passenger IDs
      const offer = await duffelGet<DuffelOffer>(`/air/offers/${offerId}`)
      const offerPassengers = offer.data.passengers

      const duffelPassengers = data.passengers.map((pax, i) => {
        const offerPax = offerPassengers[i] ?? offerPassengers[0]
        return {
          id: offerPax.id,
          given_name: pax.firstName,
          family_name: pax.lastName,
          born_on: pax.dateOfBirth,
          title: toTitle(pax.gender),
          gender: pax.gender.toLowerCase(),
          phone_number: pax.phone || data.contactPhone || '+447398753797',
          email: pax.email || data.contactEmail,
        }
      })

      // Use retry wrapper — automatically retries once on transient airline errors
      const order = await duffelPostWithRetry<DuffelOrder>('/air/orders', {
        data: {
          type: 'instant',
          selected_offers: [offerId],
          payments: [
            {
              type: 'balance',
              amount: offer.data.total_amount,
              currency: offer.data.total_currency,
            },
          ],
          passengers: duffelPassengers,
        },
      })

      airlinePnr = order.data.booking_reference

      // ── 3. Save to database ────────────────────────────────────────────────
      const totalAmount = data.totalAmount ?? data.flight.price.amount
      const currency = data.flight.price.currency

      try {
        await prisma.booking.create({
          data: {
            bookingReference: data.bookingReference,
            pnr: airlinePnr,
            status: 'PENDING',
            paymentStatus: 'SUCCEEDED',
            totalAmount,
            currency,
            type: 'FLIGHT',
            contactEmail: data.contactEmail,
            contactPhone: data.contactPhone ?? null,
            stripePaymentIntentId: data.gateway === 'stripe' ? data.paymentIntentId : null,
            flightDetails: {
              duffelOfferId: offerId,
              duffelOrderId: order.data.id,
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

      // ── 4. Send emails ─────────────────────────────────────────────────────
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
              serviceFee: data.serviceFee,
              flightDetails: flightEmailDetails,
            },
            airlinePnr
          ),
          sendBookingNotificationToAdmin({
            bookingReference: data.bookingReference,
            pnr: airlinePnr,
            orderId: order.data.id,
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
            serviceFee: data.serviceFee,
            flightDetails: flightEmailDetails,
          }),
        ])
      } catch (emailErr) {
        console.error('[Booking Confirm] Email send failed (non-fatal):', emailErr)
      }

      return NextResponse.json({
        success: true,
        pnr: airlinePnr,
        orderId: order.data.id,
        bookingReference: data.bookingReference,
        documents: order.data.documents ?? [],
        gateway: data.gateway,
        ...(data.gateway === 'flutterwave'
          ? { flutterwaveTransactionId: data.transactionId }
          : { stripePaymentIntentId: data.paymentIntentId }),
      })
    }

    // ── Non-Duffel flight fallback ─────────────────────────────────────────────
    // Payment verified but no Duffel offer — save booking and send emails
    const totalAmount = data.totalAmount ?? data.flight.price.amount
    const currency = data.flight.price.currency

    try {
      await prisma.booking.create({
        data: {
          bookingReference: data.bookingReference,
          pnr: data.bookingReference,
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
            serviceFee: data.serviceFee,
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
          serviceFee: data.serviceFee,
          flightDetails: flightEmailDetails,
        }),
      ])
    } catch (emailErr) {
      console.error('[Booking Confirm] Email send failed (non-fatal):', emailErr)
    }

    return NextResponse.json({
      success: true,
      pnr: data.bookingReference,
      bookingReference: data.bookingReference,
      gateway: data.gateway,
      message: 'Payment verified. Your booking is being processed.',
      ...(data.gateway === 'flutterwave'
        ? { flutterwaveTransactionId: data.transactionId }
        : { stripePaymentIntentId: data.paymentIntentId }),
    })

  } catch (err) {
    console.error('[Booking Confirm] Error:', err)

    // Payment has already been verified at this point — give the customer a
    // clear message that their money is safe and we'll sort the booking manually.
    const paymentRef = data.gateway === 'flutterwave'
      ? `Flutterwave transaction ${data.transactionId}`
      : `Stripe payment ${data.paymentIntentId}`

    if (err instanceof DuffelApiError) {
      // ── Offer expired / taken by someone else ──────────────────────────────
      if (err.isOfferExpired) {
        return NextResponse.json(
          {
            error:
              'This flight offer has expired. Your payment has been received — ' +
              'please contact us and we will rebook you on the next available flight or issue a full refund.',
            paymentReceived: true,
            bookingReference: data.bookingReference,
            paymentRef,
            supportEmail: 'support@walztravels.com',
          },
          { status: 409 }
        )
      }

      // ── Airline internal / transient error (retried once, still failing) ───
      if (err.isTransientAirlineError) {
        return NextResponse.json(
          {
            error:
              'The airline\'s systems are temporarily unavailable. Your payment has been received — ' +
              'we will complete your booking within the next hour and email your confirmation.',
            paymentReceived: true,
            bookingReference: data.bookingReference,
            paymentRef,
            supportEmail: 'support@walztravels.com',
          },
          { status: 503 }
        )
      }

      // ── Insufficient Duffel balance (operations issue, not customer fault) ─
      if (err.isInsufficientBalance) {
        console.error('[Booking Confirm] CRITICAL: Insufficient Duffel balance!', {
          bookingReference: data.bookingReference,
          paymentRef,
          offerId: data.flight.duffelOfferId,
        })
        return NextResponse.json(
          {
            error:
              'A temporary issue prevented ticket issuance. Your payment has been received — ' +
              'our team has been alerted and will confirm your booking within 2 hours.',
            paymentReceived: true,
            bookingReference: data.bookingReference,
            paymentRef,
            supportEmail: 'support@walztravels.com',
          },
          { status: 503 }
        )
      }

      // ── Other Duffel API error ─────────────────────────────────────────────
      return NextResponse.json(
        {
          error:
            `Booking could not be completed (${err.primaryMessage}). ` +
            'Your payment has been received — please contact support with your booking reference.',
          paymentReceived: true,
          bookingReference: data.bookingReference,
          paymentRef,
          supportEmail: 'support@walztravels.com',
          duffelCode: err.errors[0]?.code,
        },
        { status: 502 }
      )
    }

    // ── Unknown / network error ────────────────────────────────────────────────
    return NextResponse.json(
      {
        error:
          'An unexpected error occurred. Your payment has been received — ' +
          'please contact support quoting your booking reference.',
        paymentReceived: true,
        bookingReference: data.bookingReference,
        paymentRef,
        supportEmail: 'support@walztravels.com',
      },
      { status: 502 }
    )
  }
}
