import { NextRequest, NextResponse }       from 'next/server'
import { getSupabaseAdmin }                from '@/lib/supabase'
import { duffelPostWithRetry, DuffelApiError } from '@/lib/duffel/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }   = await params
    const body     = await req.json()
    const { passengers, adminNote, bookedBy } = body

    const supabase = getSupabaseAdmin()

    const { data: booking, error: fetchError } = await supabase
      .from('FlightBooking')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (!['pending_review', 'payment_confirmed'].includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot place booking with status: ${booking.status}` },
        { status: 400 },
      )
    }

    if (!booking.offerId) {
      return NextResponse.json({ error: 'No Duffel offer ID on this booking' }, { status: 400 })
    }

    // Warn if offer expired but still allow admin to try
    if (booking.offerExpiresAt && new Date(booking.offerExpiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'Duffel offer has expired. Search for a fresh flight first.', code: 'OFFER_EXPIRED' },
        { status: 422 },
      )
    }

    // Prepare passengers — use provided or fall back to saved
    const duffelPassengers = (passengers ?? booking.passengers ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any, i: number) => ({
        id:           `passenger-${i}`,
        title:        p.title        ?? 'mr',
        given_name:   p.given_name   ?? p.firstName   ?? '',
        family_name:  p.family_name  ?? p.lastName    ?? '',
        born_on:      p.born_on      ?? p.dob         ?? '',
        gender:       p.gender       ?? 'm',
        email:        p.email        ?? booking.clientEmail,
        phone_number: p.phone_number ?? p.phone       ?? booking.clientPhone ?? '',
        ...(p.infant_passenger_id ? { infant_passenger_id: p.infant_passenger_id } : {}),
      }),
    )

    let orderData: Record<string, unknown>

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await duffelPostWithRetry<{ data: any }>('/air/orders', {
        data: {
          type:             'instant',
          selected_offers:  [booking.offerId],
          passengers:       duffelPassengers,
          payments: [{
            type:     'balance',
            amount:   booking.paidAmount ?? '0',
            currency: booking.currency   ?? 'GBP',
          }],
          metadata: {
            walz_reference: booking.reference,
            walz_admin:     bookedBy ?? 'admin',
          },
        },
      })
      orderData = result.data
    } catch (duffelErr) {
      const msg = duffelErr instanceof DuffelApiError
        ? duffelErr.errors?.[0]?.message ?? duffelErr.message
        : duffelErr instanceof Error ? duffelErr.message : String(duffelErr)

      await supabase
        .from('FlightBooking')
        .update({
          status:    'booking_failed',
          adminNotes: `Booking failed on ${new Date().toLocaleString('en-GB')}: ${msg}`,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)

      return NextResponse.json({ error: 'Duffel booking failed', detail: msg }, { status: 422 })
    }

    await supabase
      .from('FlightBooking')
      .update({
        status:           'booking_placed',
        duffelOrderId:    orderData.id,
        duffelBookingRef: orderData.booking_reference,
        duffelAmount:     orderData.total_amount,
        bookedAt:         new Date().toISOString(),
        bookedBy:         bookedBy ?? null,
        adminNotes:       adminNote ?? null,
        ticketData: {
          bookingRef: orderData.booking_reference,
          slices:     orderData.slices,
          passengers: orderData.passengers,
          totalAmount: orderData.total_amount,
          currency:   orderData.total_currency,
        },
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paxList = (orderData.passengers as any[])?.map((p: any) => ({
      name:    `${p.given_name} ${p.family_name}`,
      eTicket: p.identity_documents?.[0]?.unique_identifier ?? null,
    })) ?? []

    return NextResponse.json({
      success:          true,
      duffelOrderId:    orderData.id,
      bookingReference: orderData.booking_reference,
      status:           'booking_placed',
      passengers:       paxList,
    })

  } catch (err) {
    console.error('[place-booking]', err)
    return NextResponse.json({ error: 'Failed to place booking' }, { status: 500 })
  }
}
