import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { generateBookingReference } from '@/lib/utils'

export const maxDuration = 60

function hotelbedsHeaders() {
  const key    = process.env.HOTELBEDS_HOTEL_API_KEY!
  const secret = process.env.HOTELBEDS_HOTEL_SECRET!
  const ts     = Math.floor(Date.now() / 1000).toString()
  const sig    = crypto.createHash('sha256').update(key + secret + ts).digest('hex')
  return {
    'Api-key':       key,
    'X-Signature':   sig,
    'Accept':        'application/json',
    'Content-Type':  'application/json',
  }
}

async function hbPost(path: string, body: unknown) {
  const base = process.env.HOTELBEDS_ENV === 'production'
    ? 'https://api.hotelbeds.com/hotel-api/1.0'
    : 'https://api.test.hotelbeds.com/hotel-api/1.0'
  const res = await fetch(`${base}${path}`, {
    method: 'POST', headers: hotelbedsHeaders(), body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Hotelbeds ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const {
      rateKey, rateType = 'BOOKABLE',
      hotelCode, hotelName, hotelAddress,
      checkIn, checkOut, adults, rooms,
      children = 0, childAges = [] as number[],
      rateCommentsId, destinationTimezone,
      holderName, holderEmail, holderPhone,
      totalAmount, currency,
      txRef, paymentGateway, transactionId,
    } = await req.json()

    if (!rateKey || !holderName || !holderEmail)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

    const [firstName, ...rest] = holderName.trim().split(' ')
    const lastName = rest.join(' ') || firstName

    // 1. CheckRate only if RECHECK (Hotelbeds cert req 2.5)
    let activeRateKey = rateKey
    if (rateType === 'RECHECK') {
      const cr = await hbPost('/checkrates', { rooms: [{ rateKey }] })
      activeRateKey = cr.hotel?.rooms?.[0]?.rates?.[0]?.rateKey ?? rateKey
    }

    // 2. Confirm booking (cert req 3.11 — 60s timeout)
    const ref      = generateBookingReference()
    const roomCount = Math.max(1, Number(rooms) || 1)
    // Cert 3.3 — child paxes with ages mandatory when children > 0
    const childPaxes = (childAges as number[]).map((age, i) => ({
      roomId: 1, type: 'CH', age, name: `Child${i + 1}`, surname: lastName,
    }))
    const leadPax = { roomId: 1, type: 'AD', name: firstName, surname: lastName }
    const paxes   = [leadPax, ...childPaxes]

    const bd  = await hbPost('/bookings', {
      holder:          { name: firstName, surname: lastName },
      rooms:           Array.from({ length: roomCount }, () => ({ rateKey: activeRateKey, paxes })),
      clientReference: ref,
      remark:          `Walz Travels · ${holderEmail} · ${paymentGateway} · ${txRef}`,
      tolerance:       2,
    })

    const hbBooking = bd.booking
    if (!hbBooking) throw new Error('No booking returned from Hotelbeds')

    const rate = hbBooking.hotel?.rooms?.[0]?.rates?.[0]

    // 3. Save to Prisma
    await prisma.booking.create({
      data: {
        bookingReference:      ref,
        type:                  'HOTEL',
        status:                'CONFIRMED',
        paymentStatus:         'SUCCEEDED',
        totalAmount:           Number(totalAmount),
        currency,
        contactEmail:          holderEmail,
        contactPhone:          holderPhone ?? null,
        stripePaymentIntentId: paymentGateway === 'stripe' ? String(transactionId) : null,
        passengers: [{
          holderName, holderEmail, holderPhone: holderPhone ?? null,
          hotelCode: String(hotelCode), hotelName,
          hotelAddress: hotelAddress ?? null,
          checkIn, checkOut, adults: Number(adults), rooms: Number(rooms),
          children: Number(children), childAges: childAges ?? [],
          rateCommentsId: rateCommentsId ?? null,
          destinationTimezone: destinationTimezone ?? 'UTC',
          roomName:             hbBooking.hotel?.rooms?.[0]?.name ?? null,
          boardName:            rate?.boardName ?? null,
          hotelbedsRef:         hbBooking.reference,
          supplier:             hbBooking.supplier ?? {},
          cancellationPolicies: rate?.cancellationPolicies ?? [],
          paymentGateway, transactionId: String(transactionId), txRef,
        }],
      },
    })

    return NextResponse.json({ success: true, walzRef: ref, hotelbedsRef: hbBooking.reference })
  } catch (e: any) {
    console.error('[hotels/book]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
