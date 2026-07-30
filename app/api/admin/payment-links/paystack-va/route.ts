import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import { prisma }                   from '@/lib/db'
import { calculateFee, formatFeeLabel } from '@/lib/payment-fees'

export const dynamic = 'force-dynamic'

const PS_BASE = 'https://api.paystack.co'

function normalizePhone(raw: string): string {
  // Strip whitespace, hyphens, parentheses, dots (but keep +)
  let s = raw.replace(/[\s\-\(\)\.]/g, '')
  // Leading 0 with at least 10 digits → Nigerian local number
  if (/^0\d{9,}$/.test(s)) {
    s = '+234' + s.slice(1)
  } else if (!s.startsWith('+') && /^\d{10,}$/.test(s)) {
    // Has digits but no +
    s = '+' + s
  }
  return s
}

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
    if (!clientPhone?.trim()) {
      return NextResponse.json({ error: 'Phone number is required for Paystack virtual accounts' }, { status: 400 })
    }

    const phone = normalizePhone(String(clientPhone).trim())

    // ── Fee calculation ──────────────────────────────────────────────────────
    const fee      = calculateFee(Number(amount), 'NGN', 'paystack_va')
    const feeLabel = formatFeeLabel(fee, '₦')

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
        phone,
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
        { error: custData.message || 'Failed to create Paystack customer' },
        { status: 400 },
      )
    }

    // ── 1b · Ensure phone is set on the customer ─────────────────────────────
    // POST /customer returns an existing record if the email already exists but
    // does NOT update it. If that record has no phone, POST /dedicated_account
    // will fail with "Customer phone number required". Patch it explicitly.
    if (!custData.data.phone) {
      const patchRes  = await fetch(`${PS_BASE}/customer/${custData.data.customer_code}`, {
        method:  'PUT',
        headers: { Authorization: `Bearer ${PS_SECRET}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone }),
      })
      const patchData = await patchRes.json()
      console.log('[paystack-va] customer phone patch:', {
        status:  patchData.status,
        message: patchData.message,
        phone:   patchData.data?.phone,
      })
      if (!patchData.status) {
        return NextResponse.json(
          { error: patchData.message || 'Failed to set phone on Paystack customer' },
          { status: 400 },
        )
      }
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
        { error: vaData.message || 'Failed to create dedicated account' },
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
          amount:        fee.baseAmount,   // requested amount (excl. fee)
          currency:      'NGN',
          feeChargedNgn: fee.feeTotal,     // fee we pass on to the client
          clientEmail,
          clientName:    clientName || '',
          description:   description || '',
          type:          'paystack_va',
          provider:      'paystack',
          status:        'pending',
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
      // Fee breakdown — mirrors Flutterwave route shape
      baseAmount:        fee.baseAmount,   // booking amount (excl. fee)
      feeAmount:         fee.feeTotal,     // Paystack processing fee
      feeLabel,                            // e.g. "1.5% + ₦100.00 (max ₦2,000)"
      totalCharge:       fee.totalCharge,  // client transfers this exact amount
      amount:            fee.baseAmount,
      amountToPay:       fee.totalCharge,
      currency:          'NGN',
      description:       description || '',
      tx_ref:            txRef,
      isPermanent:       true,
      expiresAt:         null,
      deadlineFormatted: null,
    })
  } catch (err: unknown) {
    console.error('[paystack-va] ERROR:', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
