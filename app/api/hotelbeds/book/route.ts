import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import prisma from '@/lib/db'
import { generateBookingReference } from '@/lib/utils'

export const maxDuration = 60 // Cert 3.11 — minimum 60s timeout

export async function POST(req: NextRequest) {
  try {
    const {
      rateKey,
      holderName,
      holderEmail,
      holderPhone,
      paxes,
      checkIn,
      checkOut,
      hotelCode,
      hotelName,
      roomName,
      boardName,
      totalNet,
      currency,
      clientReference,
      remark,
    } = await req.json()

    const [firstName, ...rest] = holderName.split(' ')
    const lastName = rest.join(' ') || firstName

    const bookingPayload = {
      holder: { name: firstName, surname: lastName },
      rooms: [
        {
          rateKey,
          paxes: paxes ?? [{ roomId: 1, type: 'AD', name: firstName, surname: lastName }],
        },
      ],
      clientReference: clientReference ?? generateBookingReference(),
      remark: remark ?? `Booked via Walz Travels — ${holderEmail}`,
      tolerance: 2,
    }

    const data = await hotelbedsRequest('hotel', '/bookings', {
      method: 'POST',
      body: bookingPayload,
    })

    const booking = data.booking
    if (!booking) throw new Error('No booking returned from Hotelbeds')

    const ref = generateBookingReference()
    await prisma.booking.create({
      data: {
        bookingReference: ref,
        type:             'HOTEL',
        status:           'CONFIRMED',
        paymentStatus:    'PENDING',
        totalAmount:      parseFloat(totalNet),
        currency,
        contactEmail:     holderEmail,
        contactPhone:     holderPhone ?? null,
        passengers: [{
          hotelbedsRef:         booking.reference,
          holderName,
          holderEmail,
          hotelCode,
          hotelName,
          checkIn,
          checkOut,
          roomName,
          boardName,
          rateKey,
          supplier:             booking.supplier,
          cancellationPolicies: booking.hotel?.rooms?.[0]?.rates?.[0]?.cancellationPolicies,
        }],
      },
    })

    return NextResponse.json({
      success:      true,
      walzRef:      ref,
      hotelbedsRef: booking.reference,
      booking,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
