import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { createStripeCustomer, createCCASetupIntent } from '@/lib/stripe'
import { decimalToMinor } from '@/lib/currency'
import { sendCCARequest } from '@/lib/email-credit-card-auth'

export const dynamic = 'force-dynamic'

function serializeCCA(a: Record<string, unknown>) {
  return {
    ...a,
    maxAmountMinor:    Number(a.maxAmountMinor),
    totalChargedMinor: Number(a.totalChargedMinor),
  }
}

// ── GET — list ─────────────────────────────────────────────────────────────────

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
      { cardholderEmail: { contains: search, mode: 'insensitive' } },
      { cardholderName:  { contains: search, mode: 'insensitive' } },
      { travellerName:   { contains: search, mode: 'insensitive' } },
      { reference:       { contains: search, mode: 'insensitive' } },
      { bookingReference: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.creditCardAuthorization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
      select: {
        id: true, reference: true, status: true,
        cardholderName: true, cardholderEmail: true,
        travellerName: true, serviceType: true, bookingReference: true,
        currency: true, maxAmountMinor: true, totalChargedMinor: true,
        allowMultipleCharges: true, validUntil: true,
        cardLast4: true, cardBrand: true,
        signedAt: true, sentAt: true, createdAt: true, createdBy: true,
      },
    }),
    prisma.creditCardAuthorization.count({ where }),
  ])

  return NextResponse.json({
    items: items.map(serializeCCA),
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}

// ── POST — create ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.permissions?.payments_create && session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Permission denied — payments_create required' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    cardholderName:             string
    cardholderEmail:            string
    cardholderPhone?:           string
    cardholderCountry?:         string
    cardholderRelationship?:    string
    cardholderRelationshipNote?: string
    isPersonalCard?:            boolean
    companyName?:               string
    travellerName:              string
    bookingReference?:          string
    travelDates?:               string
    supplier?:                  string
    serviceType:                string
    currency?:                  string
    maxAmount:                  number
    permittedCharges?:          string[]
    description:                string
    allowMultipleCharges?:      boolean
    validUntil:                 string
    notes?:                     string
    sendNow?:                   boolean
  }

  const required = ['cardholderName', 'cardholderEmail', 'travellerName', 'serviceType', 'maxAmount', 'description', 'validUntil']
  const missing = required.filter(k => !body[k as keyof typeof body])
  if (missing.length) {
    return NextResponse.json({ error: `Required fields missing: ${missing.join(', ')}` }, { status: 400 })
  }

  if (typeof body.maxAmount !== 'number' || body.maxAmount <= 0) {
    return NextResponse.json({ error: 'maxAmount must be a positive number' }, { status: 400 })
  }

  const currency      = (body.currency ?? 'gbp').toLowerCase()
  const maxAmountMinor = decimalToMinor(body.maxAmount, currency)

  // Generate reference WT-CCA-YYYYMMDD-NNNN
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const dayStart = new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`)
  const dayEnd   = new Date(dayStart.getTime() + 86400000)
  const todayCount = await prisma.creditCardAuthorization.count({
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
  })
  const reference = `WT-CCA-${dateStr}-${String(todayCount + 1).padStart(4, '0')}`

  // Generate secure token
  const rawToken  = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  // Create Stripe customer
  let stripeCustomerId: string | undefined
  try {
    const existing = await prisma.user.findUnique({ where: { email: body.cardholderEmail } })
    if (existing?.stripeCustomerId) {
      stripeCustomerId = existing.stripeCustomerId
    } else {
      const customer = await createStripeCustomer({
        email:    body.cardholderEmail,
        name:     body.cardholderName,
        phone:    body.cardholderPhone,
        metadata: { source: 'credit_card_authorization', createdBy: session.email },
      })
      stripeCustomerId = customer.id
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Stripe customer error: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 },
    )
  }

  // Create SetupIntent
  let setupIntentId: string | undefined
  try {
    const si = await createCCASetupIntent({
      customerId:      stripeCustomerId!,
      authorizationId: reference, // use reference as placeholder before DB ID exists
    })
    setupIntentId = si.id
  } catch (err) {
    return NextResponse.json(
      { error: `Stripe SetupIntent error: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 },
    )
  }

  // Create DB record
  let auth
  try {
    auth = await prisma.creditCardAuthorization.create({
      data: {
        reference,
        secureTokenHash: tokenHash,
        cardholderName:             body.cardholderName,
        cardholderEmail:            body.cardholderEmail,
        cardholderPhone:            body.cardholderPhone,
        cardholderCountry:          body.cardholderCountry,
        cardholderRelationship:     body.cardholderRelationship ?? 'self',
        cardholderRelationshipNote: body.cardholderRelationshipNote,
        isPersonalCard:             body.isPersonalCard ?? true,
        companyName:                body.companyName,
        travellerName:              body.travellerName,
        bookingReference:           body.bookingReference,
        travelDates:                body.travelDates,
        supplier:                   body.supplier,
        serviceType:                body.serviceType,
        currency,
        maxAmountMinor:             BigInt(maxAmountMinor),
        permittedCharges:           body.permittedCharges ?? [],
        description:                body.description,
        allowMultipleCharges:       body.allowMultipleCharges ?? false,
        validUntil:                 new Date(body.validUntil),
        notes:                      body.notes,
        stripeCustomerId,
        setupIntentId,
        createdBy: session.email,
      },
    })
  } catch (err) {
    console.error('[CCA] DB create failed:', err)
    return NextResponse.json(
      { error: 'Database error — ensure add_credit_card_auth.sql has been run in Supabase.' },
      { status: 500 },
    )
  }

  // Audit event
  try {
    await prisma.creditCardAuthorizationEvent.create({
      data: {
        authorizationId: auth.id,
        eventType:  'CREATED',
        staffEmail: session.email,
        amountMinor: BigInt(maxAmountMinor),
        currency,
      },
    })
  } catch {}

  // Send email if requested
  if (body.sendNow) {
    try {
      await sendCCARequest({
        cardholderEmail: auth.cardholderEmail,
        cardholderName:  auth.cardholderName,
        travellerName:   auth.travellerName,
        serviceType:     auth.serviceType,
        maxAmountMinor,
        currency,
        description:     auth.description,
        validUntil:      auth.validUntil,
        reference:       auth.reference,
        rawToken,
      })
      await prisma.creditCardAuthorization.update({
        where: { id: auth.id },
        data:  { status: 'sent', sentAt: new Date() },
      })
      await prisma.creditCardAuthorizationEvent.create({
        data: {
          authorizationId: auth.id,
          eventType:  'SENT',
          staffEmail: session.email,
        },
      }).catch(() => {})
    } catch (err) {
      console.error('[CCA] Email failed:', err)
    }
  }

  return NextResponse.json(
    { auth: serializeCCA(auth as unknown as Record<string, unknown>), rawToken },
    { status: 201 },
  )
}
