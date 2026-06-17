import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { generateBookingReference } from '@/lib/utils'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

function makeHeaders() {
  const key    = process.env.HOTELBEDS_ACTIVITIES_API_KEY!
  const secret = process.env.HOTELBEDS_ACTIVITIES_SECRET!
  const ts     = Math.floor(Date.now() / 1000).toString()
  const sig    = crypto.createHash('sha256').update(key + secret + ts).digest('hex')
  return {
    'Api-key':      key,
    'X-Signature':  sig,
    'Accept':       'application/json',
    'Content-Type': 'application/json',
  }
}

async function hbPut(path: string, body: unknown) {
  const base = process.env.HOTELBEDS_ENV === 'production'
    ? 'https://api.hotelbeds.com/activity-api/3.0'
    : 'https://api.test.hotelbeds.com/activity-api/3.0'
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: makeHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) throw new Error(`Hotelbeds activities ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const {
      activityCode,
      modalityCode,
      serviceDate,
      adults,
      children = 0,
      holderName,
      holderEmail,
      holderPhone,
      totalAmount,
      currency,
      txRef,
      paymentGateway,
      transactionId,
    } = await req.json()

    if (!activityCode || !modalityCode || !serviceDate || !holderName || !holderEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const [firstName, ...rest] = holderName.trim().split(' ')
    const lastName = rest.join(' ') || firstName

    const walzRef = generateBookingReference()

    const paxes = [
      ...Array.from({ length: Number(adults) }, () => ({ age: 30, paxType: 'ADULT' })),
      ...Array.from({ length: Number(children) }, () => ({ age: 10, paxType: 'CHILD' })),
    ]

    const bd = await hbPut('/bookings', {
      language: 'en',
      holder: {
        name:       firstName,
        surname:    lastName,
        email:      holderEmail,
        telephones: holderPhone ? [holderPhone] : [],
      },
      activities: [{
        activityCode,
        modality:    { code: modalityCode },
        serviceDate,
        paxes,
        questions:   [],
      }],
      clientReference: walzRef,
      remark: `Walz Travels · ${holderEmail} · ${paymentGateway} · ${txRef}`,
    })

    const hbRef = bd.booking?.reference ?? bd.reference ?? null

    await prisma.booking.create({
      data: {
        bookingReference:      walzRef,
        type:                  'ACTIVITY',
        status:                'CONFIRMED',
        paymentStatus:         'SUCCEEDED',
        totalAmount:           Number(totalAmount),
        currency,
        contactEmail:          holderEmail,
        contactPhone:          holderPhone ?? null,
        stripePaymentIntentId: paymentGateway === 'stripe' ? String(transactionId) : null,
        passengers: [{
          holderName, holderEmail, holderPhone: holderPhone ?? null,
          activityCode, modalityCode, serviceDate,
          adults: Number(adults), children: Number(children),
          hotelbedsRef:  hbRef,
          paymentGateway, transactionId: String(transactionId), txRef,
        }],
      },
    })

    return NextResponse.json({ success: true, walzRef, hotelbedsRef: hbRef })
  } catch (e: any) {
    console.error('[activities/book]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
