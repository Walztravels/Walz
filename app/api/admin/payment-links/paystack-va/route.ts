import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import { prisma }                   from '@/lib/db'

export const dynamic = 'force-dynamic'

const PS_BASE = 'https://api.paystack.co'

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!session.permissions?.payments_create && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_create required', required: 'payments_create' }, { status: 403 })
    }

    const PS_SECRET = process.env.PAYSTACK_SECRET_KEY
    if (!PS_SECRET) {
      return NextResponse.json({ error: 'Paystack not configured' }, { status: 500 })
    }

    const { amount, description, clientEmail, clientName, clientPhone } = await req.json()

    if (!clientEmail) {
      return NextResponse.json({ error: 'Client email is required' }, { status: 400 })
    }
    if (!clientName?.trim()) {
      return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
    }

    const nameParts  = (clientName as string).trim().split(' ')
    const first_name = nameParts[0]
    const last_name  = nameParts.slice(1).join(' ') || undefined

    const txRef = `WALZ-PS-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`

    // ── 1 · Create Paystack customer ────────────────────────────────────────
    const custRes  = await fetch(`${PS_BASE}/customer`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${PS_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:      clientEmail,
        first_name,
        last_name,
        ...(clientPhone ? { phone: clientPhone } : {}),
        metadata: { walz_tx_ref: txRef, walz_amount: amount ? String(amount) : null },
      }),
    })
    const custData = await custRes.json()

    console.log('[paystack-va] customer:', {
      status:        custData.status,
      message:       custData.message,
      customer_code: custData.data?.customer_code,
    })

    if (!custData.status || !custData.data?.customer_code) {
      return NextResponse.json(
        { error: custData.message || 'Failed to create Paystack customer', details: custData },
        { status: 400 },
      )
    }

    // ── 2 · Create dedicated virtual account on Wema Bank ───────────────────
    const vaRes  = await fetch(`${PS_BASE}/dedicated_account`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${PS_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer:       custData.data.customer_code,
        preferred_bank: 'wema-bank',
      }),
    })
    const vaData = await vaRes.json()

    console.log('[paystack-va] dedicated_account:', {
      status:        vaData.status,
      message:       vaData.message,
      accountNumber: vaData.data?.account_number,
    })

    if (!vaData.status || !vaData.data?.account_number) {
      return NextResponse.json(
        { error: vaData.message || 'Failed to create dedicated account', details: vaData },
        { status: 400 },
      )
    }

    const { account_number, bank } = vaData.data
    const bankName = bank?.name ?? 'Wema Bank'

    try {
      await prisma.paymentLink.create({
        data: {
          txRef,
          accountNumber: account_number,
          bankName,
          amount:      Number(amount) || null,
          currency:    'NGN',
          clientEmail,
          clientName:  clientName || '',
          description: description || '',
          type:        'paystack_va',
          provider:    'paystack',
          status:      'pending',
        },
      })
    } catch (dbErr: unknown) {
      console.warn('[paystack-va] DB save skipped:', (dbErr as Error).message)
    }

    return NextResponse.json({
      success:           true,
      provider:          'paystack',
      accountNumber:     account_number,
      bankName,
      amount:            Number(amount) || 0,
      amountToPay:       Number(amount) || 0,
      currency:          'NGN',
      description:       description || '',
      tx_ref:            txRef,
      isPermanent:       true,   // Paystack dedicated accounts are always permanent
      expiresAt:         null,
      deadlineFormatted: null,
    })
  } catch (err: unknown) {
    console.error('[paystack-va] ERROR:', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
