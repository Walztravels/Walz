import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import prisma from '@/lib/db'
import { generateBookingReference } from '@/lib/utils'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const {
      transferKey,
      fromCode,   fromType  = 'IATA',
      toCode,     toType    = 'IATA',
      fromDate,   fromTime,
      adults,     children  = 0,
      holderName, holderEmail, holderPhone,
      holderCountry = 'GB',
      totalAmount, currency,
      txRef, paymentGateway, transactionId,
    } = await req.json()

    if (!transferKey || !holderName || !holderEmail || !fromDate)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

    const [firstName, ...rest] = holderName.trim().split(' ')
    const lastName = rest.join(' ') || firstName
    const ref = generateBookingReference()

    const bookingPayload = {
      language: 'ENG',
      clientReference: ref,
      transfers: [{
        transferKey,
        from: { type: fromType, code: fromCode, date: fromDate, time: fromTime ?? '12:00' },
        to:   { type: toType,   code: toCode },
        holder: {
          name:    firstName,
          surname: lastName,
          email:   holderEmail,
          phone:   holderPhone ?? '',
          country: holderCountry,
        },
        passengers: { adults: Number(adults), children: Number(children), infants: 0 },
      }],
    }

    const data = await hotelbedsRequest('transfers', '/bookings', {
      method: 'POST',
      body:   bookingPayload,
    })

    const hbBooking = data?.bookings?.[0] ?? data?.booking
    if (!hbBooking) throw new Error('No booking returned from Hotelbeds')

    await prisma.booking.create({
      data: {
        bookingReference:      ref,
        type:                  'TRANSFER',
        status:                'CONFIRMED',
        paymentStatus:         'SUCCEEDED',
        totalAmount:           Number(totalAmount),
        currency:              currency ?? 'GBP',
        contactEmail:          holderEmail,
        contactPhone:          holderPhone ?? null,
        stripePaymentIntentId: paymentGateway === 'stripe' ? String(transactionId) : null,
        passengers: [{
          holderName, holderEmail, holderPhone: holderPhone ?? null,
          fromCode, toCode, fromDate, fromTime,
          adults: Number(adults), children: Number(children),
          hotelbedsRef: hbBooking.bookingId ?? hbBooking.reference ?? ref,
          paymentGateway, transactionId: String(transactionId), txRef,
        }],
      },
    })

    return NextResponse.json({
      success:      true,
      walzRef:      ref,
      hotelbedsRef: hbBooking.bookingId ?? hbBooking.reference ?? null,
    })
  } catch (e: any) {
    console.error('[transfers/book]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
