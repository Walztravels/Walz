import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { getFLWKey }                 from '@/lib/flutterwave-banks'
import { prisma }                    from '@/lib/db'
import { calculateFee }              from '@/lib/payment-fees'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!session.permissions?.payments_create && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_create required', required: 'payments_create' }, { status: 403 })
    }

    const { amount, currency, description, clientEmail, clientName } = await req.json()

    if (!amount || !currency || !description) {
      return NextResponse.json({ error: 'Amount, currency and description are required' }, { status: 400 })
    }

    const fee       = calculateFee(Number(amount), currency, 'flutterwave')
    const FLW_KEY   = getFLWKey()
    const reference = `WALZ-PAY-${Date.now()}`
    const appUrl    = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://walztravels.com'

    const res = await fetch('https://api.flutterwave.com/v3/payments', {
      method:  'POST',
      headers: { Authorization: `Bearer ${FLW_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        tx_ref:          reference,
        amount:          fee.totalCharge,
        currency,
        payment_options: 'card,banktransfer,ussd',
        redirect_url:    `${appUrl}/payment/success`,
        meta: {
          description,
          generated_by:  session.email || 'admin',
          client_name:   clientName  || '',
          client_email:  clientEmail || '',
          base_amount:   fee.baseAmount,
          fee_amount:    fee.feeTotal,
        },
        customer: {
          email: clientEmail || 'client@walztravels.com',
          name:  clientName  || 'Client',
        },
        customizations: {
          title:       'Walz Travels',
          description: `${description} · incl. ${fee.feePercent}% processing fee`,
          logo:        `${appUrl}/logo.png`,
        },
      }),
    })

    const data = await res.json()

    if (data.status === 'success' && data.data?.link) {
      try {
        await prisma.paymentLink.create({
          data: {
            txRef:       reference,
            paymentUrl:  data.data.link,
            amount:      fee.totalCharge,
            currency:    (currency as string).toUpperCase(),
            clientName:  clientName  || '',
            clientEmail: clientEmail || '',
            description: `${description} (incl. ${fee.feePercent}% fee)`,
            type:        'flutterwave',
            provider:    'flutterwave',
            status:      'pending',
          },
        })
      } catch (dbErr: any) {
        console.warn('[payment-links/flutterwave] DB save failed:', dbErr.message)
      }

      return NextResponse.json({
        success:     true,
        provider:    'flutterwave',
        url:         data.data.link,
        reference,
        baseAmount:  fee.baseAmount,
        feeAmount:   fee.feeTotal,
        feeLabel:    `${fee.feePercent}%`,
        totalCharge: fee.totalCharge,
        amount:      fee.totalCharge,
        currency,
        description,
      })
    }

    return NextResponse.json({ error: data.message || 'Failed to create payment link' }, { status: 400 })
  } catch (err: any) {
    console.error('[payment-links/flutterwave]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
