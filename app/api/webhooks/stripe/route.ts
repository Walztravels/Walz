import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { constructWebhookEvent } from '@/lib/stripe'
import { prisma } from '@/lib/db'


export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = await constructWebhookEvent(body, signature)
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent

        console.log(`[Stripe Webhook] Payment succeeded: ${paymentIntent.id}`)

        // Package deposit payment
        if (paymentIntent.metadata?.type === 'deposit' && paymentIntent.metadata.booking_ref) {
          await prisma.$executeRawUnsafe(
            `UPDATE package_bookings
             SET payment_status = 'deposit_paid',
                 payment_gateway = 'stripe',
                 payment_intent_id = $1,
                 deposit_paid_at = NOW(),
                 deposit_amount_paid = $2,
                 payment_currency = $3,
                 updated_at = NOW()
             WHERE booking_ref = $4`,
            paymentIntent.id,
            paymentIntent.amount_received / 100,
            paymentIntent.currency,
            paymentIntent.metadata.booking_ref
          )
        } else {
          // Existing flight/tour booking handling
          await prisma.booking.updateMany({
            where: {
              stripePaymentIntentId: paymentIntent.id,
              paymentStatus: 'PENDING',
            },
            data: {
              paymentStatus: 'SUCCEEDED',
            },
          })
        }

        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent

        console.log(
          `[Stripe Webhook] Payment failed: ${paymentIntent.id}`,
          paymentIntent.last_payment_error?.message
        )

        await prisma.booking.updateMany({
          where: {
            stripePaymentIntentId: paymentIntent.id,
          },
          data: {
            paymentStatus: 'FAILED',
            status: 'FAILED',
            notes: `Payment failed: ${paymentIntent.last_payment_error?.message || 'Unknown reason'}`,
          },
        })

        break
      }

      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent

        console.log(`[Stripe Webhook] Payment cancelled: ${paymentIntent.id}`)

        await prisma.booking.updateMany({
          where: {
            stripePaymentIntentId: paymentIntent.id,
          },
          data: {
            paymentStatus: 'CANCELLED',
            status: 'CANCELLED',
          },
        })

        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge

        console.log(`[Stripe Webhook] Charge refunded: ${charge.id}`)

        if (charge.payment_intent) {
          await prisma.booking.updateMany({
            where: {
              stripePaymentIntentId: charge.payment_intent as string,
            },
            data: {
              paymentStatus: 'REFUNDED',
              status: 'CANCELLED',
            },
          })
        }

        break
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.type === 'activity_booking') {
          await prisma.activityBooking.create({
            data: {
              clientName:      session.metadata.clientName  || 'Unknown',
              clientEmail:     session.metadata.clientEmail || session.customer_email || '',
              activityTitle:   session.metadata.activityTitle || null,
              location:        session.metadata.location || null,
              travelDate:      session.metadata.travelDate || null,
              adults:          parseInt(session.metadata.adults || '1'),
              totalAmount:     (session.amount_total ?? 0) / 100,
              currency:        session.currency?.toUpperCase() ?? 'GBP',
              stripeSessionId: session.id,
              status:          'confirmed',
              paymentStatus:   'PAID',
            },
          })
        }
        break
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true, type: event.type })
  } catch (error) {
    console.error('[Stripe Webhook] Handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
