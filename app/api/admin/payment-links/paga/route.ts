import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import { prisma }                   from '@/lib/db'
import {
  buildPagaCheckoutUrl,
  createDynamicBankAccount,
  registerPersistentBankAccount,
  tokenizeDirectDebit,
  computePagaFeeNgn,
  type PagaMethod,
} from '@/lib/paga'

export const dynamic = 'force-dynamic'

function txRef(prefix: string) {
  return `WALZ-PAGA-${prefix.toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!session.permissions?.payments_create && session.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Permission denied — payments_create required', required: 'payments_create' },
        { status: 403 },
      )
    }

    const body = await req.json()
    const {
      pagaMethod   = 'checkout',
      amount,
      currency     = 'NGN',
      description,
      clientName,
      clientEmail,
      clientPhone,
      // Persistent only
      bvn,
      // Direct Debit only
      sourceAccountNumber,
      bankCode,
      // Checkout only
      callbackUrl: customCallbackUrl,
    } = body

    if (!amount || Number(amount) <= 0)
      return NextResponse.json({ error: 'Amount is required and must be positive' }, { status: 400 })
    if (!description?.trim())
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    if (pagaMethod === 'checkout' && !clientEmail?.trim())
      return NextResponse.json({ error: 'Client email is required for Paga Checkout' }, { status: 400 })

    const amountNgn    = Math.round(Number(amount))
    const method       = pagaMethod as PagaMethod
    const feeChargedNgn = computePagaFeeNgn(method, amountNgn)
    const ref          = txRef(method)

    const callbackUrl = customCallbackUrl
      ?? `${process.env.NEXTAUTH_URL ?? 'https://walztravels.com'}/payment/verify?ref=${ref}&provider=paga_${method}`

    // ── Checkout ──────────────────────────────────────────────────────────────
    if (method === 'checkout') {
      const appUrl = process.env.NEXTAUTH_URL ?? 'https://www.walztravels.com'
      const checkoutUrl = buildPagaCheckoutUrl({
        referenceNumber: ref,
        amountNgn,
        email:       clientEmail!.trim(),
        chargeUrl:   callbackUrl,                            // browser redirect after payment
        callbackUrl: `${appUrl}/api/paga/webhook`,           // server-side webhook
        phoneNumber: clientPhone ?? undefined,
        currency,
      })

      try {
        await prisma.paymentLink.create({
          data: {
            txRef:          ref,
            paymentUrl:     checkoutUrl,
            amount:         amountNgn,
            currency:       currency || 'NGN',
            clientEmail:    clientEmail || null,
            clientName:     clientName  || null,
            description:    description || '',
            type:           'paga_checkout',
            status:         'pending',
            pagaMethod:     'checkout',
            feeChargedNgn,
          },
        })
      } catch (dbErr: unknown) {
        console.warn('[paga/checkout] DB save skipped:', (dbErr as Error).message)
      }

      return NextResponse.json({
        success:     true,
        provider:    'paga',
        pagaMethod:  'checkout',
        url:         checkoutUrl,
        amount:      amountNgn,
        fee:         feeChargedNgn,
        currency:    currency || 'NGN',
        description: description || '',
        tx_ref:      ref,
      })
    }

    // ── Dynamic Bank Account ──────────────────────────────────────────────────
    if (method === 'dynamic') {
      if (!clientPhone?.trim())
        return NextResponse.json({ error: 'Client phone number is required for dynamic bank transfer' }, { status: 400 })
      if (!clientName && !clientEmail)
        return NextResponse.json({ error: 'Client name or email is required for dynamic account' }, { status: 400 })
      if (amountNgn < 100)
        return NextResponse.json({ error: 'Minimum amount for dynamic bank transfer is ₦100' }, { status: 400 })

      const appUrl = process.env.NEXTAUTH_URL ?? 'https://walztravels.com'
      const acct = await createDynamicBankAccount({
        referenceNumber: ref,
        amountNgn,
        payerName:       clientName || clientEmail || 'Customer',
        payerPhone:      clientPhone.trim(),
        payerEmail:      clientEmail?.trim() || undefined,
        currency,
        callBackUrl:     `${appUrl}/api/paga/webhook`,
      })

      try {
        await prisma.paymentLink.create({
          data: {
            txRef:          ref,
            accountNumber:  acct.accountNumber,
            bankName:       acct.bankName,
            amount:         amountNgn,
            currency:       currency || 'NGN',
            clientEmail:    clientEmail || null,
            clientName:     clientName  || null,
            description:    description || '',
            type:           'paga_dynamic',
            status:         'pending',
            expiresAt:      acct.expiresAt ? new Date(acct.expiresAt) : null,
            pagaMethod:     'dynamic',
            feeChargedNgn,
          },
        })
      } catch (dbErr: unknown) {
        console.warn('[paga/dynamic] DB save skipped:', (dbErr as Error).message)
      }

      return NextResponse.json({
        success:       true,
        provider:      'paga',
        pagaMethod:    'dynamic',
        accountNumber: acct.accountNumber,
        bankName:      acct.bankName,
        accountName:   acct.accountName,
        expiresAt:     acct.expiresAt ?? null,
        amount:        amountNgn,
        fee:           feeChargedNgn,
        currency:      currency || 'NGN',
        description:   description || '',
        tx_ref:        ref,
      })
    }

    // ── Persistent Bank Account ───────────────────────────────────────────────
    if (method === 'persistent') {
      if (!clientName?.trim())
        return NextResponse.json({ error: 'Client name is required for persistent accounts' }, { status: 400 })

      const acct = await registerPersistentBankAccount({
        referenceNumber:               ref,
        accountName:                   clientName.trim(),
        customerEmail:                 clientEmail || undefined,
        customerPhone:                 clientPhone || undefined,
        financialIdentificationNumber: bvn        || undefined,
      })

      try {
        await prisma.paymentLink.create({
          data: {
            txRef:          ref,
            accountNumber:  acct.accountNumber,
            bankName:       acct.bankName,
            amount:         amountNgn,
            currency:       'NGN',
            clientEmail:    clientEmail || null,
            clientName:     clientName.trim(),
            description:    description || '',
            type:           'paga_persistent',
            status:         'pending',
            pagaMethod:     'persistent',
            feeChargedNgn,
          },
        })
      } catch (dbErr: unknown) {
        console.warn('[paga/persistent] DB save skipped:', (dbErr as Error).message)
      }

      return NextResponse.json({
        success:          true,
        provider:         'paga',
        pagaMethod:       'persistent',
        accountNumber:    acct.accountNumber,
        bankName:         acct.bankName,
        accountName:      acct.accountName,
        accountReference: acct.accountReference,
        amount:           amountNgn,
        fee:              feeChargedNgn,
        currency:         'NGN',
        description:      description || '',
        tx_ref:           ref,
      })
    }

    // ── Direct Debit ─────────────────────────────────────────────────────────
    if (method === 'direct_debit') {
      if (!sourceAccountNumber || !bankCode)
        return NextResponse.json(
          { error: 'sourceAccountNumber and bankCode are required for Direct Debit' },
          { status: 400 },
        )
      if (!clientName?.trim())
        return NextResponse.json({ error: 'Client name is required for Direct Debit' }, { status: 400 })

      const token = await tokenizeDirectDebit({
        referenceNumber:     ref,
        sourceAccountNumber,
        bankCode,
        amountNgn,
        customerName:        clientName.trim(),
        customerEmail:       clientEmail || undefined,
        currency,
      })

      try {
        await prisma.paymentLink.create({
          data: {
            txRef:          ref,
            accountNumber:  token.customerAccountNumber,
            bankName:       token.bankName ?? null,
            amount:         amountNgn,
            currency:       currency || 'NGN',
            clientEmail:    clientEmail || null,
            clientName:     clientName.trim(),
            description:    description || '',
            type:           'paga_direct_debit',
            status:         'pending',
            pagaMethod:     'direct_debit',
            feeChargedNgn,
          },
        })
      } catch (dbErr: unknown) {
        console.warn('[paga/direct_debit] DB save skipped:', (dbErr as Error).message)
      }

      return NextResponse.json({
        success:                true,
        provider:               'paga',
        pagaMethod:             'direct_debit',
        mandateReferenceNumber: token.mandateReferenceNumber,
        customerAccountNumber:  token.customerAccountNumber,
        amount:                 amountNgn,
        fee:                    feeChargedNgn,
        currency:               currency || 'NGN',
        description:            description || '',
        tx_ref:                 ref,
      })
    }

    return NextResponse.json({ error: `Unknown pagaMethod: ${pagaMethod}` }, { status: 400 })
  } catch (err: unknown) {
    console.error('[paga] ERROR:', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
