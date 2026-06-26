import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import { getFLWKey }                from '@/lib/flutterwave-banks'
import { prisma }                   from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const {
      amount,
      currency    = 'NGN',
      description,
      clientEmail,
      clientName,
      isPermanent = false,
      bvn,
    } = await req.json()

    if (!clientEmail) {
      return NextResponse.json({ error: 'clientEmail is required' }, { status: 400 })
    }
    if (!isPermanent && !amount) {
      return NextResponse.json({ error: 'amount is required for dynamic virtual accounts' }, { status: 400 })
    }
    if (isPermanent && currency === 'NGN' && !bvn) {
      return NextResponse.json({ error: 'bvn is required for permanent NGN virtual accounts' }, { status: 400 })
    }

    const tx_ref  = `WALZ-VA-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`
    const FLW_KEY = getFLWKey()

    const flwPayload: Record<string, unknown> = {
      email:        clientEmail,
      tx_ref,
      currency,
      is_permanent: isPermanent,
      narration:    description || 'Payment to Walz Travels',
    }

    // Dynamic VA: include amount (expires 1 hr on Flutterwave side)
    if (!isPermanent && amount) flwPayload.amount = Number(amount)

    // Static/permanent NGN VA: BVN required
    if (isPermanent && currency === 'NGN' && bvn) flwPayload.bvn = bvn

    const res  = await fetch('https://api.flutterwave.com/v3/virtual-account-numbers', {
      method:  'POST',
      headers: { Authorization: `Bearer ${FLW_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(flwPayload),
    })
    const data = await res.json()

    if (data.status !== 'success') {
      console.error('[virtual-account] FLW error:', data.message)
      return NextResponse.json({ error: data.message || 'Failed to create virtual account' }, { status: 400 })
    }

    const { account_number, bank_name, flw_ref, order_ref } = data.data

    // Store in DB for webhook reconciliation (fail silently — PaymentLink table may not exist yet)
    try {
      await prisma.paymentLink.create({
        data: {
          txRef:         tx_ref,
          accountNumber: account_number,
          bankName:      bank_name,
          amount:        amount ? Number(amount) : null,
          currency,
          clientEmail:   clientEmail || '',
          clientName:    clientName  || '',
          description:   description || '',
          type:          'virtual_account',
          status:        'pending',
          expiresAt:     isPermanent ? null : new Date(Date.now() + 60 * 60 * 1000),
        },
      })
    } catch (dbErr: any) {
      console.warn('[virtual-account] DB store skipped (table may not exist yet):', dbErr.message)
    }

    return NextResponse.json({
      success:      true,
      provider:     'flutterwave',
      type:         'virtual_account',
      account_number,
      bank_name,
      amount:       isPermanent ? null : Number(amount),
      currency,
      tx_ref,
      flw_ref,
      order_ref,
      description,
      expires_at:   isPermanent ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      is_permanent: isPermanent,
    })
  } catch (err: any) {
    console.error('[virtual-account]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
