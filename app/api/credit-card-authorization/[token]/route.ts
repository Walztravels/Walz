import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { createCCASetupIntent, retrieveSetupIntent } from '@/lib/stripe'
import { sendCCASignedConfirmation } from '@/lib/email-credit-card-auth'
import type Stripe from 'stripe'

export const dynamic = 'force-dynamic'

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

// ── GET — page data + SetupIntent client_secret ────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const tokenHash = hashToken(params.token)

  const auth = await prisma.creditCardAuthorization.findUnique({
    where: { secureTokenHash: tokenHash },
    select: {
      id: true, reference: true, status: true,
      cardholderName: true, cardholderEmail: true,
      travellerName: true, serviceType: true, description: true,
      currency: true, maxAmountMinor: true,
      permittedCharges: true, allowMultipleCharges: true,
      validUntil: true, signedAt: true,
      cardBrand: true, cardLast4: true, cardExpMonth: true, cardExpYear: true,
      stripeCustomerId: true, setupIntentId: true,
    },
  }).catch(() => null)

  if (!auth) {
    return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 404 })
  }

  // Terminal states
  if (auth.status === 'revoked') {
    return NextResponse.json({ error: 'This authorisation has been revoked by Walz Travels.' }, { status: 410 })
  }
  if (auth.status === 'cancelled') {
    return NextResponse.json({ error: 'This authorisation has been cancelled.' }, { status: 410 })
  }
  if (new Date() > auth.validUntil) {
    return NextResponse.json({ error: 'This authorisation has expired.' }, { status: 410 })
  }
  if (auth.status === 'draft') {
    return NextResponse.json({ error: 'This link is not yet active.' }, { status: 403 })
  }

  // Already signed
  if (['active', 'partially_used', 'fully_used', 'authentication_required'].includes(auth.status)) {
    return NextResponse.json({
      auth: {
        ...auth,
        maxAmountMinor: Number(auth.maxAmountMinor),
        alreadySigned: true,
        cardBrand: auth.cardBrand,
        cardLast4: auth.cardLast4,
      },
      clientSecret: null,
    })
  }

  // Mark as opened
  if (auth.status === 'sent') {
    await prisma.creditCardAuthorization.update({
      where: { id: auth.id },
      data:  { status: 'opened', openedAt: new Date() },
    }).catch(() => {})
    await prisma.creditCardAuthorizationEvent.create({
      data: { authorizationId: auth.id, eventType: 'OPENED' },
    }).catch(() => {})
  }

  // Get or create SetupIntent
  let clientSecret: string | null = null
  try {
    if (auth.setupIntentId) {
      const si = await retrieveSetupIntent(auth.setupIntentId)
      if (si.status === 'succeeded') {
        // Already completed (webhook might not have fired yet)
        return NextResponse.json({
          auth: { ...auth, maxAmountMinor: Number(auth.maxAmountMinor), alreadySigned: true },
          clientSecret: null,
        })
      }
      if (si.status === 'requires_payment_method') {
        // SI expired or cancelled — create a new one
        const newSI = await createCCASetupIntent({ customerId: auth.stripeCustomerId!, authorizationId: auth.id })
        await prisma.creditCardAuthorization.update({ where: { id: auth.id }, data: { setupIntentId: newSI.id } })
        clientSecret = newSI.client_secret
      } else {
        clientSecret = si.client_secret
      }
    } else if (auth.stripeCustomerId) {
      const si = await createCCASetupIntent({ customerId: auth.stripeCustomerId, authorizationId: auth.id })
      await prisma.creditCardAuthorization.update({ where: { id: auth.id }, data: { setupIntentId: si.id } })
      clientSecret = si.client_secret
    }
  } catch (err) {
    console.error('[CCA] SetupIntent retrieval failed:', err)
  }

  return NextResponse.json({
    auth: { ...auth, maxAmountMinor: Number(auth.maxAmountMinor), alreadySigned: false },
    clientSecret,
  })
}

// ── POST — complete authorization (save card + signature) ────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const tokenHash = hashToken(params.token)
  const ip        = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                 ?? req.headers.get('x-real-ip') ?? 'unknown'
  const userAgent = req.headers.get('user-agent') ?? ''

  const auth = await prisma.creditCardAuthorization.findUnique({
    where: { secureTokenHash: tokenHash },
  }).catch(() => null)

  if (!auth) return NextResponse.json({ error: 'Invalid link.' }, { status: 404 })
  if (!['sent', 'opened'].includes(auth.status)) {
    return NextResponse.json({ error: 'Authorisation is no longer in a signable state.' }, { status: 400 })
  }
  if (new Date() > auth.validUntil) {
    return NextResponse.json({ error: 'This authorisation has expired.' }, { status: 410 })
  }

  const body = await req.json().catch(() => ({})) as {
    setupIntentId:    string
    signatureName:    string
    signatureDataUrl: string
    allConsentChecked: boolean
    termsSnapshot?:   string
  }

  if (!body.setupIntentId || !body.signatureName || !body.allConsentChecked) {
    return NextResponse.json({ error: 'Missing required fields: setupIntentId, signatureName, allConsentChecked' }, { status: 400 })
  }

  // Verify SetupIntent with Stripe
  let si: Stripe.SetupIntent
  try {
    si = await retrieveSetupIntent(body.setupIntentId)
  } catch {
    return NextResponse.json({ error: 'Could not verify card setup with Stripe.' }, { status: 400 })
  }

  if (si.status !== 'succeeded') {
    return NextResponse.json({ error: `Card setup incomplete (status: ${si.status}). Please complete the card entry.` }, { status: 400 })
  }

  const pm = si.payment_method as Stripe.PaymentMethod | null
  const card = pm?.card

  await prisma.creditCardAuthorization.update({
    where: { id: auth.id },
    data: {
      status:               'active',
      stripePaymentMethodId: pm?.id,
      cardBrand:            card?.brand,
      cardLast4:            card?.last4,
      cardExpMonth:         card?.exp_month,
      cardExpYear:          card?.exp_year,
      signedAt:             new Date(),
      signatureName:        body.signatureName,
      signatureDataUrl:     body.signatureDataUrl,
      allConsentChecked:    true,
      ipAddress:            ip,
      userAgent,
      termsSnapshot:        body.termsSnapshot,
    },
  })

  await prisma.creditCardAuthorizationEvent.create({
    data: { authorizationId: auth.id, eventType: 'SIGNED', metadata: { ip, signatureName: body.signatureName } },
  }).catch(() => {})

  // Send confirmation email
  try {
    await sendCCASignedConfirmation({
      cardholderEmail: auth.cardholderEmail,
      cardholderName:  auth.cardholderName,
      reference:       auth.reference,
      serviceType:     auth.serviceType,
      maxAmountMinor:  Number(auth.maxAmountMinor),
      currency:        auth.currency,
      cardBrand:       card?.brand ?? 'Card',
      cardLast4:       card?.last4 ?? '****',
      signedAt:        new Date(),
    })
  } catch (err) {
    console.error('[CCA] Signed confirmation email failed:', err)
  }

  return NextResponse.json({ ok: true, reference: auth.reference })
}
