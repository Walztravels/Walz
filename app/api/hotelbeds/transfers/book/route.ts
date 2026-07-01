import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import prisma from '@/lib/db'
import { generateBookingReference } from '@/lib/utils'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const {
      rateKey,        transferKey,       // accept either; rateKey preferred
      fromCode,       fromType  = 'IATA',
      toCode,         toType    = 'IATA',
      toName,                            // display name of destination (needed for GPS)
      fromDate,       fromTime,
      adults,         children  = 0,
      holderName,     holderEmail, holderPhone,
      flightNumber,   flightDirection = 'ARRIVAL',
      totalAmount,    currency,
      txRef,          paymentGateway,  transactionId,
    } = await req.json()

    const resolvedRateKey = rateKey ?? transferKey
    if (!resolvedRateKey || !holderName || !holderEmail)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

    const [firstName, ...rest] = holderName.trim().split(' ')
    const lastName = rest.join(' ') || firstName
    const ref = generateBookingReference()

    // Correct Hotelbeds Transfer Booking API format:
    // holder is at root level; rateKey not transferKey; transferDetails required
    // GPS destinations require pickupInformation/dropoffInformation in the booking payload
    const gpsAddressBlock = toType === 'GPS' ? {
      dropoffInformation: {
        name:    (toName ?? 'Destination').slice(0, 50),
        address: (toName ?? 'Destination').slice(0, 100),
        town:    'N/A',
        country: 'N/A',
        zip:     '00000',
      },
    } : {}

    const bookingPayload = {
      language: 'en',
      holder: {
        name:    firstName,
        surname: lastName,
        email:   holderEmail,
        phone:   holderPhone ?? '+440000000000',
      },
      transfers: [{
        rateKey: resolvedRateKey,
        ...gpsAddressBlock,
        transferDetails: [{
          type:      'FLIGHT',
          direction: flightDirection,
          code:      flightNumber ?? 'XX0000',
        }],
      }],
      clientReference: ref,
      remark: '',
    }

    const data = await hotelbedsRequest('transfers', '/bookings', {
      method: 'POST',
      body:   bookingPayload,
    })

    const hbBooking = Array.isArray(data?.bookings) ? data.bookings[0] : (data?.booking ?? null)
    if (!hbBooking) throw new Error('No booking returned from Hotelbeds')
    const hbRef = hbBooking.reference ?? null

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
          hotelbedsRef: hbRef ?? hbBooking.bookingId ?? ref,
          paymentGateway, transactionId: String(transactionId), txRef,
        }],
      },
    })

    return NextResponse.json({
      success:      true,
      walzRef:      ref,
      hotelbedsRef: hbRef ?? hbBooking.bookingId ?? null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[transfers/book]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
