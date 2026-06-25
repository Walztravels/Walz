import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { getFLWKey }                 from '@/lib/flutterwave-banks'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { amount, currency, description, clientEmail, clientName } = await req.json()

    if (!amount || !currency || !description) {
      return NextResponse.json({ error: 'Amount, currency and description are required' }, { status: 400 })
    }

    const FLW_KEY   = getFLWKey()
    const reference = `WALZ-PAY-${Date.now()}`
    const appUrl    = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://walztravels.com'

    const res = await fetch('https://api.flutterwave.com/v3/payments', {
      method:  'POST',
      headers: { Authorization: `Bearer ${FLW_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        tx_ref:          reference,
        amount:          Number(amount),
        currency,
        payment_options: 'card,banktransfer,ussd',
        redirect_url:    `${appUrl}/payment/success`,
        meta: {
          description,
          generated_by: session.email || 'admin',
          client_name:  clientName  || '',
          client_email: clientEmail || '',
        },
        customer: {
          email: clientEmail || 'client@walztravels.com',
          name:  clientName  || 'Client',
        },
        customizations: {
          title:       'Walz Travels',
          description,
          logo:        `${appUrl}/logo.png`,
        },
      }),
    })

    const data = await res.json()

    if (data.status === 'success' && data.data?.link) {
      return NextResponse.json({
        success:     true,
        provider:    'flutterwave',
        url:         data.data.link,
        reference,
        amount,
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
