import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { duffelPost } from '@/lib/duffel/client'

export const dynamic = 'force-dynamic'

function generateRef() {
  return 'WLZ-' + Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const {
      offerId, clientName, clientEmail, clientPhone,
      passengers, totalAmount, currency,
    } = await req.json()

    if (!offerId || !clientEmail || !passengers?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    let pnr: string | null           = null
    let duffelOrderId: string | null = null

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const order: any = await duffelPost('/air/orders', {
        data: {
          type:             'instant',
          selected_offers:  [offerId],
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
            amount:   String(totalAmount),
            currency: currency ?? 'GBP',
          }],
        },
      })

      pnr           = order.data?.booking_reference ?? null
      duffelOrderId = order.data?.id ?? null
    } catch (duffelErr: unknown) {
      const msg = duffelErr instanceof Error ? duffelErr.message : String(duffelErr)
      console.warn('[Admin/book/flight] Duffel order failed:', msg)
    }

    const bookingReference = pnr ?? generateRef()

    await prisma.booking.create({
      data: {
        bookingReference,
        pnr:           pnr ?? null,
        type:          'FLIGHT',
        status:        pnr ? 'CONFIRMED' : 'PENDING',
        paymentStatus: pnr ? 'SUCCEEDED' : 'PENDING',
        totalAmount:   parseFloat(String(totalAmount ?? 0)),
        currency:      currency ?? 'GBP',
        contactEmail:  clientEmail,
        contactPhone:  clientPhone ?? null,
        flightDetails: {
          duffelOrderId,
          clientName,
          passengers,
        },
      },
    })

    return NextResponse.json({ bookingReference, pnr, duffelOrderId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Admin/book/flight]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
