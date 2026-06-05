import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'

const setupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
})

/**
 * POST /api/payment/setup
 *
 * Creates (or retrieves) a Stripe Customer and returns a SetupIntent clientSecret.
 * The frontend mounts <CardElement> with this secret so the card is saved
 * to the customer without an immediate charge.
 *
 * At booking time we charge off-session using the saved PaymentMethod.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const parsed = setupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { email, name } = parsed.data

    // Look up or create a Stripe customer
    let stripeCustomerId: string | null = null

    if (session?.user?.id) {
      // Check if user already has a Stripe customer ID stored
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = await (prisma.user as any).findUnique({
        where: { id: session.user.id },
        select: { stripeCustomerId: true },
      }) as { stripeCustomerId?: string | null } | null
      stripeCustomerId = user?.stripeCustomerId ?? null
    }

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: {
          userId: session?.user?.id ?? 'guest',
        },
      })
      stripeCustomerId = customer.id

      // Persist to DB if authenticated
      if (session?.user?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.user as any).update({
          where: { id: session.user.id },
          data: { stripeCustomerId },
        })
      }
    }

    // Create a SetupIntent so the card is saved for future off-session charges
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: {
        userId: session?.user?.id ?? 'guest',
        email,
      },
    })

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId: stripeCustomerId,
    })
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    console.error('[Payment Setup API] Error:', err)
    return NextResponse.json(
      { error: 'Could not initialise payment setup. Please try again.' },
      { status: 500 }
    )
  }
}
