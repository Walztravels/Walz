import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { duffelPost } from '@/lib/duffel/client'
import { getAdminSession } from '@/lib/admin-auth'
import { recordPaymentSucceeded } from '@/lib/commercial/payment'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function generateRef() {
  return 'WLZ-FLT-' + Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      offerId,
      clientName, clientEmail, clientPhone,
      passengers,
      totalNet,        // Duffel cost (supplier net)
      sellingPrice,    // Walz sell price
      markupPercent,
      markupAmount,
      serviceFee = 0,
      discount   = 0,
      currency   = 'GBP',
      clientId,
      paymentMethod,
      // Route metadata for display
      origin, destination, tripType, departureDate, returnDate, cabinClass,
    } = await req.json()

    if (!offerId || !clientEmail || !passengers?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    let pnr: string | null           = null
    let duffelOrderId: string | null = null

    // ── Place Duffel order ───────────────────────────────────────────────────
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const order: any = await duffelPost('/air/orders', {
        data: {
          type:            'instant',
          selected_offers: [offerId],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          passengers: passengers.map((p: any, i: number) => ({
            id:           `passenger-${i}`,
            title:        p.title ?? 'mr',
            given_name:   p.given_name,
            family_name:  p.family_name,
            born_on:      p.born_on,
            gender:       p.gender ?? 'm',
            email:        p.email,
            phone_number: p.phone_number,
          })),
          payments: [{
            type:     'balance',
            amount:   String(totalNet ?? sellingPrice),
            currency: currency ?? 'GBP',
          }],
        },
      })

      pnr           = order.data?.booking_reference ?? null
      duffelOrderId = order.data?.id ?? null
    } catch (duffelErr: unknown) {
      const msg = duffelErr instanceof Error ? duffelErr.message : String(duffelErr)
      console.warn('[Admin/book/flight] Duffel order failed:', msg)
      // Still save as PENDING if Duffel fails
    }

    const bookingReference = pnr ?? generateRef()
    const paymentStatus    = paymentMethod === 'MARK_PAID' ? 'SUCCEEDED' : (pnr ? 'SUCCEEDED' : 'PENDING')

    await prisma.booking.create({
      data: {
        bookingReference,
        pnr:              pnr ?? null,
        type:             'FLIGHT',
        status:           pnr ? 'CONFIRMED' : 'PENDING',
        paymentStatus:    paymentStatus as 'SUCCEEDED' | 'PENDING',
        totalAmount:      parseFloat(String(sellingPrice ?? totalNet ?? 0)),
        currency:         currency ?? 'GBP',
        userId:           clientId ?? null,
        contactEmail:     clientEmail,
        contactPhone:     clientPhone ?? null,
        createdByStaffId: session.staffId ?? session.id,
        flightDetails: {
          duffelOrderId,
          clientName,
          origin,
          destination,
          tripType,
          departureDate,
          returnDate:    returnDate ?? null,
          cabinClass,
          supplierNet:   parseFloat(String(totalNet ?? 0)),
          sellingPrice:  parseFloat(String(sellingPrice ?? 0)),
          markupPercent,
          markupAmount,
          serviceFee,
          discount,
          paymentMethod,
          bookedByName:  session.name,
          bookedByEmail: session.email,
          passengers,
        },
      },
    })

    await prisma.activityLog.create({
      data: {
        staffId:     session.staffId ?? session.id,
        staffName:   session.name,
        staffRole:   session.staffRole ?? session.role,
        staffBranch: session.branch ?? '',
        action:      'FLIGHT_BOOKING_CREATED',
        module:      'bookings',
        entityId:    bookingReference,
        entityType:  'Booking',
        detail:      `Flight ${bookingReference} — ${origin ?? '?'} → ${destination ?? '?'} — ${clientName} — ${currency} ${sellingPrice}`,
      },
    })

    if (paymentMethod === 'MARK_PAID') {
      recordPaymentSucceeded({
        provider:          'MANUAL',
        providerPaymentId: bookingReference,
        amount:   parseFloat(String(sellingPrice ?? 0)),
        currency: String(currency).toUpperCase(),
        metadata: { productType: 'flight', markedPaidBy: session.email, pnr, duffelOrderId },
      }).catch(() => {})
    }

    return NextResponse.json({ bookingReference, pnr, duffelOrderId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Admin/book/flight]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
