import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { capturePreAuthIntent, cancelPaymentIntent } from '@/lib/stripe'
import { sendCardAuthorizationRequest } from '@/lib/email-card-auth'

export const dynamic = 'force-dynamic'

// GET — fetch single authorization
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.permissions?.payments_view && session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const auth = await prisma.cardAuthorization.findUnique({ where: { id: params.id } })
  if (!auth) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ auth })
}

// PATCH — capture | release | cancel | update_notes | resend
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json().catch(() => ({})) as {
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
    if (!auth.stripePaymentIntentId) {
      return NextResponse.json({ error: 'No Stripe payment intent on record' }, { status: 400 })
    }

    const captureAmount = typeof body.amountToCapture === 'number' && body.amountToCapture > 0
      ? body.amountToCapture
      : undefined

    if (captureAmount && captureAmount > auth.amount) {
      return NextResponse.json({ error: 'Cannot capture more than the authorized amount' }, { status: 400 })
    }

    try {
      await capturePreAuthIntent({
        paymentIntentId: auth.stripePaymentIntentId,
        amountToCapture: captureAmount,
      })
    } catch (err) {
      return NextResponse.json(
        { error: `Stripe capture failed: ${err instanceof Error ? err.message : 'Unknown'}` },
        { status: 500 },
      )
    }

    // Webhook will confirm async, but update optimistically
    const updated = await prisma.cardAuthorization.update({
      where: { id: params.id },
      data: {
        status:        'captured',
        capturedAt:    new Date(),
        capturedBy:    session.email,
        capturedAmount: captureAmount ?? auth.amount,
      },
    })

    return NextResponse.json({ auth: updated })
  }

  // ── Release (cancel the Stripe hold) ─────────────────────────────────────────
  if (action === 'release') {
    if (!session.permissions?.payments_manage && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_manage required' }, { status: 403 })
    }
    if (auth.status !== 'authorized') {
      return NextResponse.json({ error: 'Only authorized holds can be released' }, { status: 400 })
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
    })

    return NextResponse.json({ auth: updated })
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
    })

    return NextResponse.json({ auth: updated })
  }

  // ── Update notes ─────────────────────────────────────────────────────────────
  if (action === 'update_notes') {
    if (!session.permissions?.payments_view && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const updated = await prisma.cardAuthorization.update({
      where: { id: params.id },
      data:  { notes: body.notes ?? '' },
    })

    return NextResponse.json({ auth: updated })
  }

  // ── Resend authorization link ─────────────────────────────────────────────────
  if (action === 'resend') {
    if (!session.permissions?.payments_create && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_create required' }, { status: 403 })
    }
    if (auth.status !== 'pending') {
      return NextResponse.json({ error: 'Can only resend for pending authorizations' }, { status: 400 })
    }

    try {
      await sendCardAuthorizationRequest({
        clientEmail: auth.clientEmail,
        clientName:  auth.clientName,
        amount:      auth.amount,
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
