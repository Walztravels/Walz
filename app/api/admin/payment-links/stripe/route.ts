import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import Stripe                        from 'stripe'
import { prisma }                    from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { amount, currency, description, clientEmail, clientName, feePercent = 0 } = await req.json()

    if (!amount || !currency || !description) {
      return NextResponse.json({ error: 'Amount, currency and description are required' }, { status: 400 })
    }

    const baseAmount  = Number(amount)
    const feeAmount   = feePercent > 0 ? Math.ceil(baseAmount * feePercent / 100) : 0
    const totalAmount = baseAmount + feeAmount

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

    const price = await stripe.prices.create({
      unit_amount:  Math.round(totalAmount * 100),
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

    // Save to DB for history tracking
    const txRef = `WALZ-STR-${Date.now()}`
    try {
      await prisma.paymentLink.create({
        data: {
          txRef,
          paymentUrl:  paymentLink.url,
          amount:      totalAmount,
          currency:    (currency as string).toUpperCase(),
          clientName:  clientName  || '',
          clientEmail: clientEmail || '',
          description: feeAmount > 0 ? `${description} (incl. ${feePercent}% fee)` : description || '',
          type:        'stripe',
          provider:    'stripe',
          status:      'pending',
        },
      })
    } catch (dbErr: any) {
      console.warn('[payment-links/stripe] DB save failed:', dbErr.message)
    }

    return NextResponse.json({
      success:     true,
      provider:    'stripe',
      url:         paymentLink.url,
      id:          paymentLink.id,
      txRef,
      amount,
      currency,
      description,
    })
  } catch (err: any) {
    console.error('[payment-links/stripe]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
