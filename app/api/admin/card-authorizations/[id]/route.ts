import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { capturePreAuthIntent, cancelPaymentIntent } from '@/lib/stripe'
import { sendCardAuthorizationRequest } from '@/lib/email-card-auth'
import { decimalToMinor } from '@/lib/currency'

export const dynamic = 'force-dynamic'

function serializeAuth(auth: {
  amountMinor: bigint
  capturedAmountMinor?: bigint | null
  events?: Array<{ amountMinor: bigint | null; [key: string]: unknown }>
  [key: string]: unknown
}) {
  return {
    ...auth,
    amountMinor:         Number(auth.amountMinor),
    capturedAmountMinor: auth.capturedAmountMinor != null ? Number(auth.capturedAmountMinor) : null,
    events: (auth.events ?? []).map(e => ({
      ...e,
      amountMinor: e.amountMinor != null ? Number(e.amountMinor) : null,
    })),
  }
}

// Update a CardAuthorization and return it with events if the v2 migration has been applied.
async function updateAuth(id: string, data: Record<string, unknown>) {
  try {
    return await prisma.cardAuthorization.update({
      where: { id },
      data,
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })
  } catch {
    // Fall back without events (v2 migration not yet applied)
    const result = await prisma.cardAuthorization.update({ where: { id }, data })
    return { ...result, events: [] }
  }
}

// Create an audit event — non-fatal if the events table doesn't exist yet.
async function createEvent(data: {
  authorizationId: string
  eventType: string
  staffEmail?: string
  amountMinor?: bigint
  currency?: string
  stripeEventId?: string
}) {
  try {
    await prisma.cardAuthorizationEvent.create({ data })
  } catch (err) {
    console.error('[CardAuth] Audit event insert failed (migration pending?):', err)
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

  let auth
  try {
    auth = await prisma.cardAuthorization.findUnique({
      where: { id: params.id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })
  } catch {
    auth = await prisma.cardAuthorization.findUnique({ where: { id: params.id } })
    if (auth) (auth as Record<string, unknown>).events = []
  }
  if (!auth) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ auth: serializeAuth(auth as Parameters<typeof serializeAuth>[0]) })
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
    // Guard: captureRequestedAt may not exist if v2 migration isn't applied yet
    const captureRequestedAt = (auth as Record<string, unknown>).captureRequestedAt as Date | null | undefined
    if (captureRequestedAt) {
      return NextResponse.json({ error: 'Capture already requested — awaiting Stripe confirmation' }, { status: 400 })
    }
    if (!auth.stripePaymentIntentId) {
      return NextResponse.json({ error: 'No Stripe payment intent on record' }, { status: 400 })
    }

    const authAmountMinor = Number((auth as Record<string, unknown>).amountMinor ?? 0)
      || decimalToMinor(auth.amount, auth.currency)

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
    const updateData: Record<string, unknown> = {
      capturedBy: session.email,
    }
    // captureRequestedAt only exists after v2 migration
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE card_authorizations SET "captureRequestedAt" = $1 WHERE id = $2`,
        now, params.id,
      )
    } catch {
      // Column not yet migrated — skip; capturedBy still records who initiated
    }

    const updated = await updateAuth(params.id, updateData)
    // Ensure captureRequestedAt is reflected in returned object
    if (!(updated as Record<string, unknown>).captureRequestedAt) {
      (updated as Record<string, unknown>).captureRequestedAt = now.toISOString()
    }

    await createEvent({
      authorizationId: auth.id,
      eventType:       'CAPTURE_REQUESTED',
      staffEmail:      session.email,
      amountMinor:     BigInt(captureAmountMinor ?? authAmountMinor),
      currency:        auth.currency,
    })

    return NextResponse.json({ auth: serializeAuth(updated as Parameters<typeof serializeAuth>[0]) })
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

    const updated = await updateAuth(params.id, {
      status:     'released',
      releasedAt: new Date(),
      releasedBy: session.email,
    })

    await createEvent({
      authorizationId: auth.id,
      eventType:       'RELEASED',
      staffEmail:      session.email,
    })

    return NextResponse.json({ auth: serializeAuth(updated as Parameters<typeof serializeAuth>[0]) })
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

    const updated = await updateAuth(params.id, {
      status:      'cancelled',
      cancelledAt: new Date(),
      cancelledBy: session.email,
    })

    await createEvent({
      authorizationId: auth.id,
      eventType:       'CANCELLED',
      staffEmail:      session.email,
    })

    return NextResponse.json({ auth: serializeAuth(updated as Parameters<typeof serializeAuth>[0]) })
  }

  // ── Update notes ─────────────────────────────────────────────────────────────
  if (action === 'update_notes') {
    if (!session.permissions?.payments_view && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const updated = await updateAuth(params.id, { notes: body.notes ?? '' })

    return NextResponse.json({ auth: serializeAuth(updated as Parameters<typeof serializeAuth>[0]) })
  }

  // ── Resend authorization link ─────────────────────────────────────────────────
  if (action === 'resend') {
    if (!session.permissions?.payments_create && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — payments_create required' }, { status: 403 })
    }
    if (auth.status !== 'pending') {
      return NextResponse.json({ error: 'Can only resend for pending authorizations' }, { status: 400 })
    }

    const amountMinor = Number((auth as Record<string, unknown>).amountMinor ?? 0)
      || decimalToMinor(auth.amount, auth.currency)

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
