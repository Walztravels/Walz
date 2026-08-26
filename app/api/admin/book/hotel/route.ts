import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import { hotelbedsRequest }         from '@/lib/hotelbeds'
import prisma                       from '@/lib/db'

export const maxDuration = 60   // Hotelbeds booking can be slow — Cert 3.11

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const {
      rateKey,
      holderName,
      holderEmail,
      holderPhone,
      checkIn,
      checkOut,
      hotelCode,
      hotelName,
      roomName,
      boardName,
      boardCode,
      nights,
      rooms        = 1,
      adults       = 2,
      children     = 0,
      totalNet,        // supplier net (float)
      sellingPrice,    // Walz sell price
      markupPercent,
      markupAmount,
      serviceFee   = 0,
      discount     = 0,
      currency,
      clientId,
      paymentMethod,
    } = await req.json()

    if (!rateKey || !holderName || !holderEmail || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'Missing required booking fields' }, { status: 400 })
    }

    // ── Generate Walz reference ──────────────────────────────────────────────
    const walzRef = `WALZ-HTL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    // ── Hotelbeds booking ────────────────────────────────────────────────────
    const [firstName, ...rest] = holderName.trim().split(' ')
    const lastName = rest.join(' ') || firstName

    const hotelbedsPayload = {
      holder: { name: firstName, surname: lastName },
      rooms:  [{ rateKey, paxes: [{ roomId: 1, type: 'AD', name: firstName, surname: lastName }] }],
      clientReference: walzRef,
      remark: `Admin booking by ${session.name} (${session.email}) — ${holderEmail}`,
      tolerance: 2,
    }

    const data = await hotelbedsRequest('hotel', '/bookings', {
      method: 'POST',
      body:   hotelbedsPayload,
    })

    const hbBooking = data.booking
    if (!hbBooking) throw new Error('Hotelbeds returned no booking object')

    const hotelbedsRef: string = hbBooking.reference ?? ''

    // ── Payment status ───────────────────────────────────────────────────────
    const paymentStatus = paymentMethod === 'MARK_PAID' ? 'SUCCEEDED' : 'PENDING'

    // ── Persist to DB ────────────────────────────────────────────────────────
    await prisma.booking.create({
      data: {
        bookingReference: walzRef,
        type:             'HOTEL',
        status:           'CONFIRMED',
        paymentStatus:    paymentStatus as 'SUCCEEDED' | 'PENDING',
        totalAmount:      parseFloat(String(sellingPrice)),
        currency,
        userId:           clientId ?? null,
        contactEmail:     holderEmail,
        contactPhone:     holderPhone ?? null,
        createdByStaffId: session.staffId ?? session.id,
        hotelDetails: {
          hotelCode,
          hotelName,
          roomName,
          boardName,
          boardCode,
          checkIn,
          checkOut,
          nights,
          rooms,
          adults,
          children,
          holderName,
          holderEmail,
          holderPhone: holderPhone ?? null,
          hotelbedsRef,
          supplierNet:    parseFloat(String(totalNet)),
          sellingPrice:   parseFloat(String(sellingPrice)),
          markupPercent,
          markupAmount,
          serviceFee,
          discount,
          paymentMethod,
          cancellationPolicies:
            hbBooking.hotel?.rooms?.[0]?.rates?.[0]?.cancellationPolicies ?? [],
          bookedByName:  session.name,
          bookedByEmail: session.email,
        },
      },
    })

    // ── Audit log ────────────────────────────────────────────────────────────
    await prisma.activityLog.create({
      data: {
        staffId:    session.staffId ?? session.id,
        staffName:  session.name,
        staffRole:  session.staffRole ?? session.role,
        staffBranch: session.branch ?? '',
        action:     'HOTEL_BOOKING_CREATED',
        module:     'bookings',
        entityId:   walzRef,
        entityType: 'Booking',
        detail:     `Hotel booking ${walzRef} — ${hotelName} — ${holderName} — ${currency} ${sellingPrice}`,
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
    console.error('[Admin Hotel Booking]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
