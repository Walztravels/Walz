import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { sendCCARequest, sendCCARevoked, sendCCAAuthRequired, sendCCAChargeSuccess, sendCCAChargeFailed } from '@/lib/email-credit-card-auth'
import { createOffSessionPaymentIntent, createPartialRefund } from '@/lib/stripe'
import { decimalToMinor, formatCurrencyMinor } from '@/lib/currency'

export const dynamic = 'force-dynamic'

type SerializableAuth = Record<string, unknown> & {
  maxAmountMinor: bigint
  totalChargedMinor: bigint
  transactions?: Array<Record<string, unknown> & { amountMinor: bigint; refundedAmountMinor?: bigint | null }>
  events?: Array<Record<string, unknown> & { amountMinor?: bigint | null }>
}

function serializeCCA(a: SerializableAuth) {
  return {
    ...a,
    maxAmountMinor:    Number(a.maxAmountMinor),
    totalChargedMinor: Number(a.totalChargedMinor),
    transactions: (a.transactions ?? []).map(t => ({
      ...t,
      amountMinor:        Number(t.amountMinor),
      refundedAmountMinor: t.refundedAmountMinor != null ? Number(t.refundedAmountMinor) : null,
    })),
    events: (a.events ?? []).map(e => ({
      ...e,
      amountMinor: e.amountMinor != null ? Number(e.amountMinor) : null,
    })),
  }
}

async function addEvent(data: {
  authorizationId: string
  eventType: string
  staffEmail?: string
  amountMinor?: bigint
  currency?: string
  stripeEventId?: string
}) {
  try {
    await prisma.creditCardAuthorizationEvent.create({ data })
  } catch (err) {
    console.error('[CCA] Event insert failed:', err)
  }
}

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.permissions?.payments_view && session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const auth = await prisma.creditCardAuthorization.findUnique({
    where: { id: params.id },
    include: {
      transactions: { orderBy: { createdAt: 'desc' } },
      events:       { orderBy: { createdAt: 'asc'  } },
    },
  })
  if (!auth) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ auth: serializeCCA(auth as unknown as SerializableAuth) })
}

// ── PATCH ──────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    action:           'send' | 'resend' | 'charge' | 'revoke' | 'refund' | 'send_auth_link' | 'update_notes'
    amount?:          number
    description?:     string
    transactionId?:   string
    revocationReason?: string
    notes?:           string
  }

  const auth = await prisma.creditCardAuthorization.findUnique({
    where: { id: params.id },
    include: { transactions: true },
  })
  if (!auth) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Send / Resend ────────────────────────────────────────────────────────────
  if (body.action === 'send' || body.action === 'resend') {
    if (!session.permissions?.payments_create && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_create required' }, { status: 403 })
    }

    const allowedStatuses = body.action === 'send'
      ? ['draft']
      : ['sent', 'opened']
    if (!allowedStatuses.includes(auth.status)) {
      return NextResponse.json(
        { error: `Cannot ${body.action} — current status: ${auth.status}` },
        { status: 400 },
      )
    }

    // Retrieve raw token from secureTokenHash by generating a new one
    // (We cannot reverse the hash; issue a new token and update the hash)
    const rawToken  = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    try {
      await sendCCARequest({
        cardholderEmail: auth.cardholderEmail,
        cardholderName:  auth.cardholderName,
        travellerName:   auth.travellerName,
        serviceType:     auth.serviceType,
        maxAmountMinor:  Number(auth.maxAmountMinor),
        currency:        auth.currency,
        description:     auth.description,
        validUntil:      auth.validUntil,
        reference:       auth.reference,
        rawToken,
      })
    } catch (err) {
      return NextResponse.json(
        { error: `Email failed: ${err instanceof Error ? err.message : 'Unknown'}` },
        { status: 500 },
      )
    }

    const updated = await prisma.creditCardAuthorization.update({
      where: { id: auth.id },
      data:  {
        secureTokenHash: tokenHash,
        status:          'sent',
        sentAt:          new Date(),
      },
      include: { transactions: true, events: { orderBy: { createdAt: 'asc' } } },
    })

    await addEvent({ authorizationId: auth.id, eventType: body.action === 'send' ? 'SENT' : 'RESENT', staffEmail: session.email })

    return NextResponse.json({ auth: serializeCCA(updated as unknown as SerializableAuth) })
  }

  // ── Charge Card ──────────────────────────────────────────────────────────────
  if (body.action === 'charge') {
    if (!session.permissions?.payments_manage && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_manage required' }, { status: 403 })
    }

    if (!['active', 'partially_used', 'authentication_required'].includes(auth.status)) {
      return NextResponse.json({ error: 'Authorization is not active' }, { status: 400 })
    }
    if (!auth.stripeCustomerId || !auth.stripePaymentMethodId) {
      return NextResponse.json({ error: 'No saved card on file' }, { status: 400 })
    }
    if (!auth.allowMultipleCharges && Number(auth.totalChargedMinor) > 0) {
      return NextResponse.json({ error: 'Multiple charges not permitted on this authorization' }, { status: 400 })
    }

    const now = new Date()
    if (now > auth.validUntil) {
      return NextResponse.json({ error: 'Authorization has expired' }, { status: 400 })
    }

    if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }

    const amountMinor = decimalToMinor(body.amount, auth.currency)
    const remaining   = Number(auth.maxAmountMinor) - Number(auth.totalChargedMinor)

    if (amountMinor > remaining) {
      return NextResponse.json(
        { error: `Amount ${formatCurrencyMinor(amountMinor, auth.currency)} exceeds remaining limit ${formatCurrencyMinor(remaining, auth.currency)}` },
        { status: 400 },
      )
    }

    const idempotencyKey = `cca-${auth.id}-${now.getTime()}`
    const description    = body.description ?? auth.description

    // Create transaction record (pending)
    const tx = await prisma.creditCardAuthorizationTransaction.create({
      data: {
        authorizationId:    auth.id,
        amountMinor:        BigInt(amountMinor),
        currency:           auth.currency,
        description,
        idempotencyKey,
        requestedBy:        session.email,
        status:             'processing',
      },
    })

    await addEvent({
      authorizationId: auth.id,
      eventType:   'CHARGE_REQUESTED',
      staffEmail:  session.email,
      amountMinor: BigInt(amountMinor),
      currency:    auth.currency,
      metadata:    { transactionId: tx.id },
    } as Parameters<typeof addEvent>[0])

    let pi
    try {
      pi = await createOffSessionPaymentIntent({
        amountMinor,
        currency:        auth.currency,
        customerId:      auth.stripeCustomerId!,
        paymentMethodId: auth.stripePaymentMethodId!,
        description,
        idempotencyKey,
        metadata: {
          authorizationId:  auth.id,
          reference:        auth.reference,
          transactionId:    tx.id,
          requestedBy:      session.email,
        },
      })
    } catch (err) {
      // Stripe error (card declined, etc.)
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      const isStripeError = errMsg.includes('requires_action') || errMsg.includes('authentication')

      if (!isStripeError) {
        const safe = getSafeFailureMessage(err)
        await prisma.creditCardAuthorizationTransaction.update({
          where: { id: tx.id },
          data: {
            status:             'failed',
            failedAt:           new Date(),
            safeFailureMessage: safe,
            failureCode:        err instanceof Error && 'code' in err ? String((err as { code: string }).code) : undefined,
          },
        })
        await addEvent({ authorizationId: auth.id, eventType: 'CHARGE_FAILED', staffEmail: session.email, amountMinor: BigInt(amountMinor), currency: auth.currency })

        try {
          await sendCCAChargeFailed({
            cardholderEmail:    auth.cardholderEmail,
            cardholderName:     auth.cardholderName,
            reference:          auth.reference,
            amountMinor,
            currency:           auth.currency,
            safeFailureMessage: safe,
          })
        } catch {}

        return NextResponse.json({ error: `Charge failed: ${safe}` }, { status: 402 })
      }
    }

    if (!pi) {
      return NextResponse.json({ error: 'Payment intent not created' }, { status: 500 })
    }

    // Handle PI status
    if (pi.status === 'succeeded') {
      const newTotal = Number(auth.totalChargedMinor) + amountMinor
      const newStatus = newTotal >= Number(auth.maxAmountMinor) ? 'fully_used' : 'partially_used'

      await prisma.creditCardAuthorizationTransaction.update({
        where: { id: tx.id },
        data: {
          stripePaymentIntentId: pi.id,
          stripeChargeId:        typeof pi.latest_charge === 'string' ? pi.latest_charge : undefined,
          status:                'paid',
          succeededAt:           new Date(),
        },
      })

      await prisma.creditCardAuthorization.update({
        where: { id: auth.id },
        data: {
          status:            newStatus,
          totalChargedMinor: BigInt(newTotal),
        },
      })

      await addEvent({ authorizationId: auth.id, eventType: 'CHARGE_SUCCEEDED', staffEmail: session.email, amountMinor: BigInt(amountMinor), currency: auth.currency, stripeEventId: pi.id })

      try {
        await sendCCAChargeSuccess({
          cardholderEmail: auth.cardholderEmail,
          cardholderName:  auth.cardholderName,
          reference:       auth.reference,
          serviceType:     auth.serviceType,
          amountMinor,
          currency:        auth.currency,
          cardBrand:       auth.cardBrand ?? 'Card',
          cardLast4:       auth.cardLast4 ?? '****',
          description,
          chargedAt:       new Date(),
        })
      } catch {}

      const refreshed = await prisma.creditCardAuthorization.findUnique({
        where:   { id: auth.id },
        include: { transactions: { orderBy: { createdAt: 'desc' } }, events: { orderBy: { createdAt: 'asc' } } },
      })
      return NextResponse.json({ auth: serializeCCA(refreshed as unknown as SerializableAuth), status: 'paid' })
    }

    if (pi.status === 'requires_action') {
      // 3DS required — generate auth token, send email
      const rawAuthToken  = crypto.randomBytes(32).toString('hex')
      const authTokenHash = crypto.createHash('sha256').update(rawAuthToken).digest('hex')

      await prisma.creditCardAuthorizationTransaction.update({
        where: { id: tx.id },
        data: {
          stripePaymentIntentId:  pi.id,
          status:                 'authentication_required',
          authenticationTokenHash: authTokenHash,
        },
      })

      await prisma.creditCardAuthorization.update({
        where: { id: auth.id },
        data:  { status: 'authentication_required' },
      })

      await addEvent({ authorizationId: auth.id, eventType: 'AUTH_REQUIRED', staffEmail: session.email, amountMinor: BigInt(amountMinor), currency: auth.currency })

      try {
        await sendCCAAuthRequired({
          cardholderEmail: auth.cardholderEmail,
          cardholderName:  auth.cardholderName,
          reference:       auth.reference,
          amountMinor,
          currency:        auth.currency,
          description,
          rawAuthToken,
        })
      } catch (err) {
        console.error('[CCA] Auth required email failed:', err)
      }

      const refreshed = await prisma.creditCardAuthorization.findUnique({
        where:   { id: auth.id },
        include: { transactions: { orderBy: { createdAt: 'desc' } }, events: { orderBy: { createdAt: 'asc' } } },
      })
      return NextResponse.json({
        auth:    serializeCCA(refreshed as unknown as SerializableAuth),
        status:  'authentication_required',
        message: 'Authentication required — link sent to cardholder.',
      })
    }

    return NextResponse.json({ error: `Unexpected PI status: ${pi.status}` }, { status: 500 })
  }

  // ── Send Auth Link (resend for existing auth_required transaction) ────────────
  if (body.action === 'send_auth_link') {
    if (!session.permissions?.payments_manage && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const tx = auth.transactions.find(
      t => t.id === body.transactionId && t.status === 'authentication_required',
    )
    if (!tx) return NextResponse.json({ error: 'Transaction not found or not in authentication_required status' }, { status: 400 })

    const rawAuthToken  = crypto.randomBytes(32).toString('hex')
    const authTokenHash = crypto.createHash('sha256').update(rawAuthToken).digest('hex')

    await prisma.creditCardAuthorizationTransaction.update({
      where: { id: tx.id },
      data:  { authenticationTokenHash: authTokenHash },
    })

    await sendCCAAuthRequired({
      cardholderEmail: auth.cardholderEmail,
      cardholderName:  auth.cardholderName,
      reference:       auth.reference,
      amountMinor:     Number(tx.amountMinor),
      currency:        auth.currency,
      description:     tx.description,
      rawAuthToken,
    })

    await addEvent({ authorizationId: auth.id, eventType: 'AUTH_LINK_RESENT', staffEmail: session.email })

    return NextResponse.json({ ok: true, message: 'Authentication link resent' })
  }

  // ── Revoke ───────────────────────────────────────────────────────────────────
  if (body.action === 'revoke') {
    if (!session.permissions?.payments_manage && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_manage required' }, { status: 403 })
    }
    if (['revoked', 'cancelled', 'fully_used'].includes(auth.status)) {
      return NextResponse.json({ error: 'Cannot revoke — already in final state' }, { status: 400 })
    }

    const updated = await prisma.creditCardAuthorization.update({
      where: { id: auth.id },
      data: {
        status:          'revoked',
        revokedAt:       new Date(),
        revokedBy:       session.email,
        revocationReason: body.revocationReason,
      },
      include: { transactions: { orderBy: { createdAt: 'desc' } }, events: { orderBy: { createdAt: 'asc' } } },
    })

    await addEvent({ authorizationId: auth.id, eventType: 'REVOKED', staffEmail: session.email })

    try {
      await sendCCARevoked({
        cardholderEmail: auth.cardholderEmail,
        cardholderName:  auth.cardholderName,
        reference:       auth.reference,
        reason:          body.revocationReason,
      })
    } catch {}

    return NextResponse.json({ auth: serializeCCA(updated as unknown as SerializableAuth) })
  }

  // ── Refund Transaction ────────────────────────────────────────────────────────
  if (body.action === 'refund') {
    if (!session.permissions?.payments_refund && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_refund required' }, { status: 403 })
    }

    const tx = auth.transactions.find(t => t.id === body.transactionId && t.status === 'paid')
    if (!tx || !tx.stripePaymentIntentId) {
      return NextResponse.json({ error: 'Transaction not found or not eligible for refund' }, { status: 400 })
    }

    const refundAmountMinor = body.amount
      ? decimalToMinor(body.amount, auth.currency)
      : Number(tx.amountMinor)

    try {
      await createPartialRefund({ paymentIntentId: tx.stripePaymentIntentId, amountMinor: refundAmountMinor })
    } catch (err) {
      return NextResponse.json({ error: `Refund failed: ${err instanceof Error ? err.message : 'Unknown'}` }, { status: 500 })
    }

    const isFullRefund = refundAmountMinor >= Number(tx.amountMinor)
    await prisma.creditCardAuthorizationTransaction.update({
      where: { id: tx.id },
      data: {
        status:             isFullRefund ? 'refunded' : 'partially_refunded',
        refundedAmountMinor: BigInt(refundAmountMinor),
        refundedAt:          new Date(),
        refundedBy:          session.email,
      },
    })

    const newTotal = Math.max(0, Number(auth.totalChargedMinor) - refundAmountMinor)
    const newStatus = newTotal < Number(auth.maxAmountMinor) ? 'active' : auth.status
    await prisma.creditCardAuthorization.update({
      where: { id: auth.id },
      data:  { totalChargedMinor: BigInt(newTotal), status: newStatus },
    })

    await addEvent({ authorizationId: auth.id, eventType: 'REFUNDED', staffEmail: session.email, amountMinor: BigInt(refundAmountMinor), currency: auth.currency })

    const refreshed = await prisma.creditCardAuthorization.findUnique({
      where:   { id: auth.id },
      include: { transactions: { orderBy: { createdAt: 'desc' } }, events: { orderBy: { createdAt: 'asc' } } },
    })
    return NextResponse.json({ auth: serializeCCA(refreshed as unknown as SerializableAuth) })
  }

  // ── Update notes ──────────────────────────────────────────────────────────────
  if (body.action === 'update_notes') {
    const updated = await prisma.creditCardAuthorization.update({
      where: { id: auth.id },
      data:  { notes: body.notes ?? '' },
      include: { transactions: { orderBy: { createdAt: 'desc' } }, events: { orderBy: { createdAt: 'asc' } } },
    })
    return NextResponse.json({ auth: serializeCCA(updated as unknown as SerializableAuth) })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

function getSafeFailureMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'Payment could not be processed.'
  const msg = err.message.toLowerCase()
  if (msg.includes('insufficient_funds') || msg.includes('insufficient funds')) return 'Your card has insufficient funds.'
  if (msg.includes('card_declined') || msg.includes('declined')) return 'Your card was declined.'
  if (msg.includes('expired_card') || msg.includes('expired card')) return 'Your card has expired.'
  if (msg.includes('do_not_honor')) return 'Your card issuer declined the payment.'
  return 'Payment could not be processed. Please contact your bank or Walz Travels.'
}
