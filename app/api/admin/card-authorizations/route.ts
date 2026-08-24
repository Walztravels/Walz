import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { createPreAuthIntent, createStripeCustomer } from '@/lib/stripe'
import { sendCardAuthorizationRequest } from '@/lib/email-card-auth'
import { decimalToMinor } from '@/lib/currency'

export const dynamic = 'force-dynamic'

function serializeAuthItem(auth: {
  amountMinor: bigint
  capturedAmountMinor: bigint | null
  [key: string]: unknown
}) {
  return {
    ...auth,
    amountMinor:         Number(auth.amountMinor),
    capturedAmountMinor: auth.capturedAmountMinor != null ? Number(auth.capturedAmountMinor) : null,
  }
}

// GET — list all card authorizations
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.permissions?.payments_view && session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const sp     = new URL(req.url).searchParams
  const status = sp.get('status')
  const search = sp.get('search')
  const page   = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const limit  = 50

  const where: Record<string, unknown> = {}
  if (status && status !== 'all') where.status = status
  if (search) {
    where.OR = [
      { clientEmail: { contains: search, mode: 'insensitive' } },
      { clientName:  { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { bookingRef:  { contains: search, mode: 'insensitive' } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.cardAuthorization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.cardAuthorization.count({ where }),
  ])

  return NextResponse.json({
    items: items.map(serializeAuthItem),
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}

// POST — create a new authorization request and email the client
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.permissions?.payments_create && session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Permission denied — payments_create required' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    amount:       number
    currency?:    string
    description:  string
    clientEmail:  string
    clientName:   string
    clientPhone?: string
    bookingRef?:  string
    bookingId?:   string
    applicationId?: string
    leadId?:      string
    notes?:       string
  }

  if (!body.amount || !body.description || !body.clientEmail || !body.clientName) {
    return NextResponse.json(
      { error: 'amount, description, clientEmail, and clientName are required' },
      { status: 400 },
    )
  }

  if (typeof body.amount !== 'number' || body.amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const currency    = (body.currency ?? 'gbp').toLowerCase()
  const amountMinor = decimalToMinor(body.amount, currency)

  let stripePaymentIntentId: string | undefined
  let stripeClientSecret: string | undefined
  let stripeCustomerId: string | undefined

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: body.clientEmail } })
    if (existingUser?.stripeCustomerId) {
      stripeCustomerId = existingUser.stripeCustomerId
    } else {
      const customer = await createStripeCustomer({
        email: body.clientEmail,
        name:  body.clientName,
        phone: body.clientPhone,
        metadata: { source: 'card_authorization', createdBy: session.email },
      })
      stripeCustomerId = customer.id
    }

    const pi = await createPreAuthIntent({
      amountMinor,
      currency,
      description: body.description,
      customerId:  stripeCustomerId,
      metadata: {
        source:      'card_authorization',
        clientEmail: body.clientEmail,
        clientName:  body.clientName,
        createdBy:   session.email,
        ...(body.bookingRef    && { bookingRef:    body.bookingRef }),
        ...(body.bookingId     && { bookingId:     body.bookingId }),
        ...(body.applicationId && { applicationId: body.applicationId }),
      },
    })

    stripePaymentIntentId = pi.id
    stripeClientSecret    = pi.client_secret ?? undefined
  } catch (err) {
    console.error('[CardAuth] Stripe PI creation failed:', err)
    return NextResponse.json(
      { error: `Stripe error: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 },
    )
  }

  const auth = await prisma.cardAuthorization.create({
    data: {
      amount:               body.amount,
      amountMinor:          BigInt(amountMinor),
      currency,
      description:          body.description,
      clientEmail:          body.clientEmail,
      clientName:           body.clientName,
      clientPhone:          body.clientPhone,
      bookingRef:           body.bookingRef,
      bookingId:            body.bookingId,
      applicationId:        body.applicationId,
      leadId:               body.leadId,
      notes:                body.notes,
      stripePaymentIntentId,
      stripeCustomerId,
      createdBy:            session.email,
    },
  })

  // CREATED audit event
  await prisma.cardAuthorizationEvent.create({
    data: {
      authorizationId: auth.id,
      eventType:       'CREATED',
      staffEmail:      session.email,
      amountMinor:     BigInt(amountMinor),
      currency,
    },
  })

  try {
    await sendCardAuthorizationRequest({
      clientEmail:  auth.clientEmail,
      clientName:   auth.clientName,
      amountMinor,
      currency:     auth.currency,
      description:  auth.description,
      token:        auth.token,
    })
  } catch (err) {
    console.error('[CardAuth] Email send failed:', err)
  }

  return NextResponse.json({ auth: serializeAuthItem(auth), clientSecret: stripeClientSecret }, { status: 201 })
}
