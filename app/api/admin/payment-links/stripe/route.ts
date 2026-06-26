import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import Stripe                        from 'stripe'
import { prisma }                    from '@/lib/db'
import { calculateFee, formatFeeLabel, type Provider } from '@/lib/payment-fees'

export const dynamic = 'force-dynamic'

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'CA$' }

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const {
      amount,
      currency    = 'GBP',
      description,
      clientEmail,
      clientName,
      cardType    = 'eu',   // 'eu' | 'non_eu'
    } = await req.json()

    if (!amount || !currency || !description) {
      return NextResponse.json({ error: 'Amount, currency and description are required' }, { status: 400 })
    }

    const provider: Provider = cardType === 'non_eu' ? 'stripe_non_eu' : 'stripe_eu'
    const fee   = calculateFee(Number(amount), currency, provider)
    const sym   = SYM[currency] ?? currency
    const label = formatFeeLabel(fee, sym)

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

    const price = await stripe.prices.create({
      unit_amount:  Math.round(fee.totalCharge * 100),
      currency:     currency.toLowerCase(),
      product_data: {
        name:     description,
        metadata: {
          generated_by:  'walztravels_admin',
          base_amount:   String(fee.baseAmount),
          fee_amount:    String(fee.feeTotal),
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
        base_amount:   String(fee.baseAmount),
      },
      custom_text: {
        submit: {
          message: `Paying Walz Travels for: ${description} · incl. ${label} processing fee`,
        },
      },
    })

    const txRef = `WALZ-STR-${Date.now()}`
    try {
      await prisma.paymentLink.create({
        data: {
          txRef,
          paymentUrl:  paymentLink.url,
          amount:      fee.totalCharge,
          currency:    (currency as string).toUpperCase(),
          clientName:  clientName  || '',
          clientEmail: clientEmail || '',
          description: `${description} (incl. ${label} fee)`,
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
      baseAmount:  fee.baseAmount,
      feeAmount:   fee.feeTotal,
      feeLabel:    label,
      totalCharge: fee.totalCharge,
      amount:      fee.totalCharge,
      currency,
      description,
    })
  } catch (err: any) {
    console.error('[payment-links/stripe]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
