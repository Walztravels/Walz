import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import Stripe                        from 'stripe'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { amount, currency, description, clientEmail, clientName } = await req.json()

    if (!amount || !currency || !description) {
      return NextResponse.json({ error: 'Amount, currency and description are required' }, { status: 400 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

    const price = await stripe.prices.create({
      unit_amount:  Math.round(Number(amount) * 100),
      currency:     currency.toLowerCase(),
      product_data: {
        name:     description,
        metadata: {
          generated_by:  'walztravels_admin',
          client_name:   clientName  || '',
          client_email:  clientEmail || '',
        },
      },
    })

    const paymentLink = await stripe.paymentLinks.create({
      line_items:       [{ price: price.id, quantity: 1 }],
      after_completion: {
        type:                 'hosted_confirmation',
        hosted_confirmation:  {
          custom_message: 'Thank you for your payment to Walz Travels. We will be in touch shortly.',
        },
      },
      metadata: {
        client_email:  clientEmail || '',
        client_name:   clientName  || '',
        generated_by:  session.email || 'admin',
        description,
      },
      custom_text: {
        submit: { message: `Paying Walz Travels for: ${description}` },
      },
    })

    return NextResponse.json({
      success:     true,
      provider:    'stripe',
      url:         paymentLink.url,
      id:          paymentLink.id,
      amount,
      currency,
      description,
    })
  } catch (err: any) {
    console.error('[payment-links/stripe]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
