import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import { hotelbedsRequest }         from '@/lib/hotelbeds'
import prisma                       from '@/lib/db'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const {
      transferKey,
      fromCode,   fromType  = 'IATA',
      toCode,     toType    = 'IATA',
      fromDisplay,          // human-readable from label
      toDisplay,            // human-readable to label
      fromDate,   fromTime  = '12:00',
      adults = 2, children  = 0,
      holderName,  holderEmail, holderPhone,
      flightNumber, flightDirection = 'ARRIVAL',
      vehicleName, vehicleDesc, maxPax,
      totalNet,        // supplier net (float)
      sellingPrice,    // Walz sell price
      markupPercent,
      markupAmount,
      serviceFee   = 0,
      discount     = 0,
      currency     = 'GBP',
      clientId,
      paymentMethod,
    } = await req.json()

    if (!transferKey || !holderName || !holderEmail || !fromDate) {
      return NextResponse.json({ error: 'Missing required booking fields' }, { status: 400 })
    }

    const walzRef = `WALZ-TRF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    const [firstName, ...rest] = holderName.trim().split(' ')
    const lastName = rest.join(' ') || firstName

    const gpsBlock = toType === 'GPS' ? {
      dropoffInformation: {
        name:    (toDisplay ?? 'Destination').slice(0, 50),
        address: (toDisplay ?? 'Destination').slice(0, 100),
        town:    'N/A',
        country: 'N/A',
        zip:     '00000',
      },
    } : {}

    const bookingPayload = {
      language:        'en',
      holder: {
        name:    firstName,
        surname: lastName,
        email:   holderEmail,
        phone:   holderPhone ?? '+440000000000',
      },
      transfers: [{
        rateKey: transferKey,
        ...gpsBlock,
        transferDetails: [{
          type:      'FLIGHT',
          direction: flightDirection,
          code:      flightNumber ?? 'XX0000',
        }],
      }],
      clientReference: walzRef,
      remark: `Admin booking by ${session.name} (${session.email})`,
    }

    const data = await hotelbedsRequest('transfers', '/bookings', {
      method: 'POST',
      body:   bookingPayload,
    })

    const hbBooking  = Array.isArray(data?.bookings) ? data.bookings[0] : (data?.booking ?? null)
    if (!hbBooking) throw new Error('Hotelbeds returned no booking object')
    const hotelbedsRef: string = hbBooking.reference ?? hbBooking.bookingId ?? ''

    const paymentStatus = paymentMethod === 'MARK_PAID' ? 'SUCCEEDED' : 'PENDING'

    await prisma.booking.create({
      data: {
        bookingReference: walzRef,
        type:             'TRANSFER',
        status:           'CONFIRMED',
        paymentStatus:    paymentStatus as 'SUCCEEDED' | 'PENDING',
        totalAmount:      parseFloat(String(sellingPrice)),
        currency,
        userId:           clientId ?? null,
        contactEmail:     holderEmail,
        contactPhone:     holderPhone ?? null,
        createdByStaffId: session.staffId ?? session.id,
        passengers: [{
          holderName, holderEmail,
          holderPhone:      holderPhone ?? null,
          fromCode,         fromType,
          toCode,           toType,
          fromDisplay:      fromDisplay ?? fromCode,
          toDisplay:        toDisplay   ?? toCode,
          fromDate,         fromTime,
          flightNumber:     flightNumber ?? null,
          flightDirection,
          adults:           Number(adults),
          children:         Number(children),
          vehicleName:      vehicleName ?? null,
          vehicleDesc:      vehicleDesc ?? null,
          maxPax:           maxPax ?? null,
          hotelbedsRef,
          supplierNet:      parseFloat(String(totalNet)),
          sellingPrice:     parseFloat(String(sellingPrice)),
          markupPercent,
          markupAmount,
          serviceFee,
          discount,
          paymentMethod,
          bookedByName:     session.name,
          bookedByEmail:    session.email,
        }],
      },
    })

    await prisma.activityLog.create({
      data: {
        staffId:     session.staffId ?? session.id,
        staffName:   session.name,
        staffRole:   session.staffRole ?? session.role,
        staffBranch: session.branch ?? '',
        action:      'TRANSFER_BOOKING_CREATED',
        module:      'bookings',
        entityId:    walzRef,
        entityType:  'Booking',
        detail:      `Transfer ${walzRef} — ${fromDisplay ?? fromCode} → ${toDisplay ?? toCode} — ${holderName} — ${currency} ${sellingPrice}`,
      },
    })

    return NextResponse.json({
      success:      true,
      walzRef,
      hotelbedsRef,
      sellingPrice,
      currency,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Admin Transfer Booking]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
