import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { capturePreAuthIntent, cancelPaymentIntent } from '@/lib/stripe'
import { sendCardAuthorizationRequest } from '@/lib/email-card-auth'
import { decimalToMinor } from '@/lib/currency'

export const dynamic = 'force-dynamic'

function serializeAuth(auth: {
  amountMinor: bigint
  capturedAmountMinor: bigint | null
  events?: Array<{ amountMinor: bigint | null; [key: string]: unknown }>
  [key: string]: unknown
}) {
  return {
    ...auth,
    amountMinor:         Number(auth.amountMinor),
    capturedAmountMinor: auth.capturedAmountMinor != null ? Number(auth.capturedAmountMinor) : null,
    events: auth.events?.map(e => ({
      ...e,
      amountMinor: e.amountMinor != null ? Number(e.amountMinor) : null,
    })),
  }
}

// GET — fetch single authorization with audit events
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.permissions?.payments_view && session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const auth = await prisma.cardAuthorization.findUnique({
    where: { id: params.id },
    include: {
      events: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!auth) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ auth: serializeAuth(auth) })
}

// PATCH — capture | release | cancel | update_notes | resend
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    action:          'capture' | 'release' | 'cancel' | 'update_notes' | 'resend'
    amountToCapture?: number
    notes?:           string
  }
  const { action } = body

  const auth = await prisma.cardAuthorization.findUnique({ where: { id: params.id } })
  if (!auth) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Capture ──────────────────────────────────────────────────────────────────
  if (action === 'capture') {
    if (!session.permissions?.payments_manage && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_manage required' }, { status: 403 })
    }
    if (auth.status !== 'authorized') {
      return NextResponse.json({ error: 'Only authorized holds can be captured' }, { status: 400 })
    }
    if (auth.captureRequestedAt) {
      return NextResponse.json({ error: 'Capture already requested — awaiting Stripe confirmation' }, { status: 400 })
    }
    if (!auth.stripePaymentIntentId) {
      return NextResponse.json({ error: 'No Stripe payment intent on record' }, { status: 400 })
    }

    const authAmountMinor = Number(auth.amountMinor) || decimalToMinor(auth.amount, auth.currency)

    // amountToCapture from UI is a decimal (e.g. 8500.00); convert to minor units
    const captureAmountMinor = typeof body.amountToCapture === 'number' && body.amountToCapture > 0
      ? decimalToMinor(body.amountToCapture, auth.currency)
      : undefined

    if (captureAmountMinor !== undefined && captureAmountMinor > authAmountMinor) {
      return NextResponse.json({ error: 'Cannot capture more than the authorized amount' }, { status: 400 })
    }

    try {
      await capturePreAuthIntent({
        paymentIntentId:     auth.stripePaymentIntentId,
        amountMinorToCapture: captureAmountMinor,
      })
    } catch (err) {
      return NextResponse.json(
        { error: `Stripe capture failed: ${err instanceof Error ? err.message : 'Unknown'}` },
        { status: 500 },
      )
    }

    const now = new Date()

    // Record when capture was requested. Do NOT set capturedAt or capturedAmountMinor here —
    // the webhook sets those with Stripe's authoritative values.
    const updated = await prisma.cardAuthorization.update({
      where: { id: params.id },
      data: {
        captureRequestedAt: now,
        capturedBy:         session.email,
        // status stays 'authorized' — webhook sets 'captured'
      },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })

    // CAPTURE_REQUESTED audit event
    await prisma.cardAuthorizationEvent.create({
      data: {
        authorizationId: auth.id,
        eventType:       'CAPTURE_REQUESTED',
        staffEmail:      session.email,
        amountMinor:     BigInt(captureAmountMinor ?? authAmountMinor),
        currency:        auth.currency,
      },
    })

    return NextResponse.json({ auth: serializeAuth(updated) })
  }

  // ── Release (cancel the Stripe hold) ─────────────────────────────────────────
  if (action === 'release') {
    if (!session.permissions?.payments_manage && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_manage required' }, { status: 403 })
    }
    if (auth.status !== 'authorized') {
      return NextResponse.json({ error: 'Only authorized holds can be released' }, { status: 400 })
    }
    if (auth.captureRequestedAt) {
      return NextResponse.json({ error: 'Cannot release — capture already requested' }, { status: 400 })
    }
    if (!auth.stripePaymentIntentId) {
      return NextResponse.json({ error: 'No Stripe payment intent on record' }, { status: 400 })
    }

    try {
      await cancelPaymentIntent(auth.stripePaymentIntentId)
    } catch (err) {
      return NextResponse.json(
        { error: `Stripe release failed: ${err instanceof Error ? err.message : 'Unknown'}` },
        { status: 500 },
      )
    }

    const updated = await prisma.cardAuthorization.update({
      where: { id: params.id },
      data: {
        status:     'released',
        releasedAt: new Date(),
        releasedBy: session.email,
      },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })

    await prisma.cardAuthorizationEvent.create({
      data: {
        authorizationId: auth.id,
        eventType:       'RELEASED',
        staffEmail:      session.email,
      },
    })

    return NextResponse.json({ auth: serializeAuth(updated) })
  }

  // ── Cancel (before client authorizes) ────────────────────────────────────────
  if (action === 'cancel') {
    if (!session.permissions?.payments_manage && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_manage required' }, { status: 403 })
    }
    if (!['pending', 'authorized'].includes(auth.status)) {
      return NextResponse.json({ error: 'Cannot cancel a completed or already-cancelled authorization' }, { status: 400 })
    }

    if (auth.stripePaymentIntentId && auth.status === 'authorized') {
      try {
        await cancelPaymentIntent(auth.stripePaymentIntentId)
      } catch (err) {
        console.error('[CardAuth] Stripe cancel failed (non-fatal):', err)
      }
    }

    const updated = await prisma.cardAuthorization.update({
      where: { id: params.id },
      data: {
        status:      'cancelled',
        cancelledAt: new Date(),
        cancelledBy: session.email,
      },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })

    await prisma.cardAuthorizationEvent.create({
      data: {
        authorizationId: auth.id,
        eventType:       'CANCELLED',
        staffEmail:      session.email,
      },
    })

    return NextResponse.json({ auth: serializeAuth(updated) })
  }

  // ── Update notes ─────────────────────────────────────────────────────────────
  if (action === 'update_notes') {
    if (!session.permissions?.payments_view && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const updated = await prisma.cardAuthorization.update({
      where: { id: params.id },
      data:  { notes: body.notes ?? '' },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({ auth: serializeAuth(updated) })
  }

  // ── Resend authorization link ─────────────────────────────────────────────────
  if (action === 'resend') {
    if (!session.permissions?.payments_create && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_create required' }, { status: 403 })
    }
    if (auth.status !== 'pending') {
      return NextResponse.json({ error: 'Can only resend for pending authorizations' }, { status: 400 })
    }

    const amountMinor = Number(auth.amountMinor) || decimalToMinor(auth.amount, auth.currency)

    try {
      await sendCardAuthorizationRequest({
        clientEmail: auth.clientEmail,
        clientName:  auth.clientName,
        amountMinor,
        currency:    auth.currency,
        description: auth.description,
        token:       auth.token,
      })
    } catch (err) {
      return NextResponse.json(
        { error: `Email failed: ${err instanceof Error ? err.message : 'Unknown'}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, message: 'Authorization link resent' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
