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
      currency        = 'NGN',
      description,
      clientEmail,
      clientName,
      clientPhone,
      isPermanent     = false,
      bvn,
      paymentDeadline = 1,
    } = await req.json()

    if (!isPermanent && !amount) {
      return NextResponse.json({ error: 'Amount is required for temporary virtual accounts' }, { status: 400 })
    }
    if (!clientEmail) {
      return NextResponse.json({ error: 'Client email is required' }, { status: 400 })
    }
    if (!clientName?.trim()) {
      return NextResponse.json({ error: 'Client name is required for virtual accounts' }, { status: 400 })
    }

    const nameParts = (clientName as string).trim().split(' ')
    const firstname = nameParts[0]
    const lastname  = nameParts.slice(1).join(' ') || 'N/A'

    const tx_ref       = `WALZ-VA-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`
    const FLW_KEY      = getFLWKey()
    const cur          = currency === 'GHS' ? 'GHS' : 'NGN'
    const deadlineHours = isPermanent ? null : (Number(paymentDeadline) || 1)
    const expiresAt     = isPermanent ? null : new Date(Date.now() + (deadlineHours as number) * 3_600_000)
    const deadlineFormatted = expiresAt
      ? expiresAt.toLocaleString('en-GB', {
          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
        }) + ' (WAT)'
      : null

    // Required fields per Flutterwave OpenAPI spec
    const payload: Record<string, unknown> = {
      email:     clientEmail,
      firstname,
      lastname,
      currency:  cur,
      tx_ref,
      narration: description || `Walz Travels — ${clientName}`,
      // Flutterwave MFB (090567) is most reliable — Sterling Bank (232) reverses payments
      bank_code: '090567',
    }

    if (clientPhone) payload.phonenumber = clientPhone

    if (isPermanent) {
      // Permanent VAs accept any transfer amount — never set amount
      payload.is_permanent = true
      if (cur === 'NGN' && bvn) payload.bvn = bvn
    } else {
      // Temporary VAs require exact amount match — send amount as integer
      payload.amount       = Math.round(Number(amount))
      payload.is_permanent = false
    }

    console.log('[virtual-account] Creating VA:', { email: clientEmail, amount, currency: cur, isPermanent, tx_ref })

    const res  = await fetch('https://api.flutterwave.com/v3/virtual-account-numbers', {
      method:  'POST',
      headers: { Authorization: `Bearer ${FLW_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const data = await res.json()

    console.log('[virtual-account] FLW response:', {
      status:        data.status,
      message:       data.message,
      accountNumber: data.data?.account_number,
    })

    if (data.status === 'success' && data.data?.account_number) {
      // FLW returns the fee-inclusive amount the client must actually transfer.
      // Using our requested amount causes reversals because the totals don't match.
      const flwAmount      = parseFloat(String(data.data.amount)) || Number(amount)
      const requestedAmount = Number(amount) || 0
      const fee            = Math.max(0, Math.round((flwAmount - requestedAmount) * 100) / 100)

      try {
        await prisma.paymentLink.create({
          data: {
            txRef:         tx_ref,
            accountNumber: data.data.account_number,
            bankName:      data.data.bank_name,
            amount:        flwAmount,   // fee-inclusive — what client must pay
            currency:      cur,
            clientEmail,
            clientName:    clientName || '',
            description:   description || '',
            type:          'virtual_account',
            status:        'pending',
            expiresAt,
          },
        })
      } catch (dbErr: any) {
        console.warn('[virtual-account] DB save skipped:', dbErr.message)
      }

      return NextResponse.json({
        success:         true,
        provider:        'flutterwave_va',
        accountNumber:   data.data.account_number,
        bankName:        data.data.bank_name,
        expiryDate:      data.data.expiry_date ?? null,
        flwRef:          data.data.flw_ref,
        amount:          requestedAmount,
        amountToPay:     flwAmount,    // fee-inclusive — show this to the client
        requestedAmount,
        fee,
        currency:        cur,
        description:     description || '',
        tx_ref,
        isPermanent,
        expiresAt:       expiresAt?.toISOString() ?? null,
        deadlineHours,
        deadlineFormatted,
      })
    }

    return NextResponse.json(
      { error: data.message || 'Failed to create virtual account', details: data },
      { status: 400 }
    )
  } catch (err: any) {
    console.error('[virtual-account] ERROR:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
