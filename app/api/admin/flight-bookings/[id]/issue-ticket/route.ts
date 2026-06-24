import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin }          from '@/lib/supabase'
import { duffelGet }                 from '@/lib/duffel/client'
import { getResend }                 from '@/lib/resend'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FROM = 'Walz Travels <bookings@walztravels.com>'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }   = await params
    const body     = await req.json()
    const { issuedBy } = body

    const supabase = getSupabaseAdmin()

    const { data: booking, error } = await supabase
      .from('FlightBooking')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (!['booking_placed', 'ticket_issued'].includes(booking.status)) {
      return NextResponse.json(
        { error: 'Booking must be placed on Duffel before issuing ticket' },
        { status: 400 },
      )
    }

    if (!booking.duffelOrderId) {
      return NextResponse.json({ error: 'No Duffel order ID on this booking' }, { status: 400 })
    }

    // Fetch full order from Duffel for ticket details
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderResult = await duffelGet<{ data: any }>(`/air/orders/${booking.duffelOrderId}`)
    const order = orderResult.data

    // Build structured ticket data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapSegment = (seg: any) => ({
      flightNumber:  `${seg.marketing_carrier?.iata_code ?? ''}${seg.marketing_carrier_flight_number ?? ''}`,
      airline:       seg.marketing_carrier?.name ?? '',
      airlineCode:   seg.marketing_carrier?.iata_code ?? '',
      aircraft:      seg.aircraft?.name ?? '',
      departure: {
        iataCode: seg.origin?.iata_code      ?? '',
        city:     seg.origin?.city_name      ?? '',
        airport:  seg.origin?.name           ?? '',
        date:     (seg.departing_at ?? '').split('T')[0] ?? '',
        time:     (seg.departing_at ?? '').split('T')[1]?.substring(0, 5) ?? '',
        terminal: seg.origin_terminal        ?? '',
      },
      arrival: {
        iataCode: seg.destination?.iata_code ?? '',
        city:     seg.destination?.city_name ?? '',
        airport:  seg.destination?.name      ?? '',
        date:     (seg.arriving_at ?? '').split('T')[0] ?? '',
        time:     (seg.arriving_at ?? '').split('T')[1]?.substring(0, 5) ?? '',
        terminal: seg.destination_terminal   ?? '',
      },
      duration:   seg.duration ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cabinClass: seg.passengers?.[0]?.cabin_class_marketing_name ?? seg.passengers?.[0]?.cabin_class ?? 'Economy',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      baggage:    seg.passengers?.[0]?.baggages?.[0]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? `${(seg.passengers[0].baggages[0] as any).quantity}× ${(seg.passengers[0].baggages[0] as any).type}`
        : '23kg checked',
    })

    const ticketData = {
      reference:   booking.reference,
      airlinePNR:  order.booking_reference ?? booking.duffelBookingRef ?? '',
      bookingDate: booking.createdAt,
      tripType:    booking.tripType === 'round_trip' ? 'Round Trip' : 'One Way',
      client: {
        name:  booking.clientName ?? '',
        email: booking.clientEmail,
        phone: booking.clientPhone ?? '',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outboundLegs: (order.slices?.[0]?.segments ?? []).map((s: any) => mapSegment(s)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      returnLegs:   (order.slices?.[1]?.segments ?? []).map((s: any) => mapSegment(s)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      passengers: (order.passengers ?? []).map((p: any) => ({
        title:      p.title ?? 'Mr',
        firstName:  p.given_name ?? '',
        lastName:   p.family_name ?? '',
        eTicket:    p.identity_documents?.[0]?.unique_identifier ?? '',
        cabinClass: 'Economy',
      })),
    }

    // Update DB first
    await supabase
      .from('FlightBooking')
      .update({
        status:         'ticket_issued',
        ticketIssuedAt: new Date().toISOString(),
        ticketIssuedBy: issuedBy ?? null,
        ticketSentAt:   new Date().toISOString(),
        ticketData,
        updatedAt:      new Date().toISOString(),
      })
      .eq('id', id)

    // Send ticket email
    await sendTicketEmail(booking, ticketData)

    return NextResponse.json({ success: true, status: 'ticket_issued', ticketData })

  } catch (err) {
    console.error('[issue-ticket]', err)
    return NextResponse.json({ error: 'Failed to issue ticket' }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendTicketEmail(booking: any, ticket: any) {
  const resend    = getResend()
  const firstName = (booking.clientName ?? 'Traveller').split(' ')[0]
  const outLeg    = ticket.outboundLegs?.[0]

  const allLegs = [...(ticket.outboundLegs ?? []), ...(ticket.returnLegs ?? [])]

  const flightRows = allLegs.map((leg: typeof ticket.outboundLegs[0]) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:bold;font-family:monospace;">${leg.flightNumber}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${leg.airline}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${leg.departure.date} ${leg.departure.time}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${leg.departure.iataCode} → ${leg.arrival.iataCode}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${leg.arrival.date} ${leg.arrival.time}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#16a34a;font-weight:bold;">CONFIRMED</td>
    </tr>
  `).join('')

  const passengerRows = (ticket.passengers ?? []).map((p: typeof ticket.passengers[0]) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${p.title} ${p.firstName} ${p.lastName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-family:monospace;">${p.eTicket || 'Pending'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${p.cabinClass}</td>
    </tr>
  `).join('')

  await resend.emails.send({
    from:    FROM,
    to:      booking.clientEmail,
    subject: `✈ Your E-Ticket — ${booking.reference} — ${outLeg?.departure?.iataCode ?? '?'} → ${outLeg?.arrival?.iataCode ?? '?'}`,
    html: `
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"></head>
      <body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
        <div style="max-width:620px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);">

          <div style="background:#0B1F3A;padding:24px;text-align:center;">
            <h1 style="color:#C9A84C;margin:0;font-size:24px;letter-spacing:2px;">WALZ TRAVELS</h1>
            <p style="color:white;margin:4px 0 0;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Electronic Ticket</p>
          </div>

          <div style="background:#16A34A;padding:10px;text-align:center;">
            <p style="color:white;margin:0;font-weight:bold;font-size:15px;">✓ BOOKING CONFIRMED</p>
          </div>

          <div style="padding:24px;">
            <p style="font-size:16px;color:#0B1F3A;margin:0 0 8px;">Hi ${firstName},</p>
            <p style="color:#6b7280;margin:0;">Your flight is confirmed. Please keep this email as your e-ticket.</p>
          </div>

          <div style="margin:0 24px;padding:16px;background:#F0F9FF;border-radius:8px;border:1px solid #BAE6FD;text-align:center;">
            <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Booking Reference</p>
            <p style="margin:6px 0 2px;font-size:28px;font-weight:bold;color:#0B1F3A;letter-spacing:4px;font-family:monospace;">${booking.reference}</p>
            <p style="margin:0;font-size:12px;color:#6b7280;">Airline PNR: <strong style="font-family:monospace;color:#0B1F3A;">${ticket.airlinePNR}</strong></p>
          </div>

          <div style="padding:24px">
            <h2 style="font-size:14px;font-weight:bold;color:#0B1F3A;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Flight Details</h2>
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="background:#0B1F3A;color:white;">
                    <th style="padding:8px 12px;text-align:left;">Flight</th>
                    <th style="padding:8px 12px;text-align:left;">Airline</th>
                    <th style="padding:8px 12px;text-align:left;">Departure</th>
                    <th style="padding:8px 12px;text-align:left;">Route</th>
                    <th style="padding:8px 12px;text-align:left;">Arrival</th>
                    <th style="padding:8px 12px;text-align:left;">Status</th>
                  </tr>
                </thead>
                <tbody>${flightRows}</tbody>
              </table>
            </div>
          </div>

          <div style="padding:0 24px 24px;">
            <h2 style="font-size:14px;font-weight:bold;color:#0B1F3A;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Passengers</h2>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #e5e7eb;">Name</th>
                  <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #e5e7eb;">E-Ticket No.</th>
                  <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #e5e7eb;">Cabin</th>
                </tr>
              </thead>
              <tbody>${passengerRows}</tbody>
            </table>
          </div>

          <div style="background:#0B1F3A;padding:16px;text-align:center;">
            <p style="color:#C9A84C;margin:0;font-size:12px;">Questions? WhatsApp: +44 7398 753797</p>
            <p style="color:#9ca3af;margin:4px 0 0;font-size:11px;">bookings@walztravels.com · walztravels.com</p>
          </div>
        </div>
      </body></html>
    `,
  })
}
