import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { duffelPost } from '@/lib/duffel/client'
import prisma from '@/lib/db'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@supabase/supabase-js'
import React from 'react'
import { TicketPDFDocument, type TicketData } from '@/components/admin/TicketPDF'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'generated-tickets'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── Major carrier scoring (higher = more preferred) ─────────────────────────
const PREFERRED_CARRIERS: Record<string, number> = {
  BA: 10, EK: 10, QR: 10, LH: 9, AF: 9, KL: 9, ET: 8,
  TK: 8, UA: 7, AA: 7, DL: 7, SQ: 10, CX: 9, VS: 8,
  W3: 6, WT: 5, DY: 4, FR: 3, U2: 3, VY: 3,
}

function makeRef(): string {
  return `WLZ-FLT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function genPNR(): string {
  return Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
}

function genSeat(): string {
  return `${Math.floor(10 + Math.random() * 30)}${['A','B','C','D','E','F'][Math.floor(Math.random() * 6)]}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function fmtDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!m) return iso
  const h = m[1] ? `${m[1]}h ` : ''
  const min = m[2] ? `${m[2]}m` : ''
  return `${h}${min}`.trim()
}

// ─── Score an offer for quality (prefers major carriers, direct flights) ──────
function scoreOffer(offer: {
  slices: Array<{ segments: Array<{ marketing_carrier: { iata_code: string } }> }>
}): number {
  const firstSeg = offer.slices[0]?.segments[0]
  if (!firstSeg) return 0
  const carrier = firstSeg.marketing_carrier.iata_code
  const carrierScore = PREFERRED_CARRIERS[carrier] ?? 5
  const stops = offer.slices.reduce((acc, s) => acc + Math.max(0, s.segments.length - 1), 0)
  return carrierScore - stops * 2
}

// ─── Upload PDF to Supabase and return public URL ─────────────────────────────
async function uploadPDF(buffer: Buffer, reference: string): Promise<string | null> {
  try {
    const now   = new Date()
    const year  = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const path  = `tickets/${year}/${month}/${reference}.pdf`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true })
    if (error) { console.warn('[dummy-ticket] upload:', error.message); return null }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch (e) {
    console.warn('[dummy-ticket] upload error:', e)
    return null
  }
}

// ─── Render TicketPDF to buffer + base64 ─────────────────────────────────────
async function renderTicketPDF(ticketData: TicketData): Promise<Buffer> {
  const element = React.createElement(TicketPDFDocument, { data: ticketData })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any)
}

// ─── Duffel types ─────────────────────────────────────────────────────────────

interface DuffelPlace {
  iata_code: string
  name: string
  city_name?: string
}

interface DuffelBaggage {
  type: 'carry_on' | 'checked'
  quantity: number
}

interface DuffelSegment {
  origin:                          DuffelPlace
  destination:                     DuffelPlace
  departing_at:                    string
  arriving_at:                     string
  duration:                        string
  marketing_carrier:               { iata_code: string; name: string }
  marketing_carrier_flight_number: string
  passengers:                      Array<{ baggages: DuffelBaggage[] }>
}

interface DuffelSlice {
  origin:       DuffelPlace
  destination:  DuffelPlace
  departing_at: string
  arriving_at:  string
  duration:     string
  segments:     DuffelSegment[]
}

interface DuffelOffer {
  id:             string
  total_amount:   string
  total_currency: string
  cabin_class:    string
  slices:         DuffelSlice[]
}

interface DuffelOfferResponse {
  data: { offers: DuffelOffer[] }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    mode:          'live' | 'manual' | 'hotel'
    applicationId?: string

    // Live mode
    originIata?:    string
    destIata?:      string
    departureDate?: string
    returnDate?:    string
    cabinClass?:    string

    // Manual mode — all optional
    clientName?:       string
    passportNumber?:   string
    fromCode?:         string
    fromCity?:         string
    toCode?:           string
    toCity?:           string
    airline?:          string
    flightNumber?:     string
    departureDateTime?: string
    arrivalDateTime?:   string
    duration?:         string
    cabin?:            string
    seat?:             string
    baggage?:          string
    terminal?:         string
    gate?:             string
    pnr?:              string
    message?:          string

    // Hotel mode
    hotelName?:       string
    hotelAddress?:    string
    checkIn?:         string
    checkOut?:        string
    roomType?:        string
    numGuests?:       string
  }

  // ── Optional: auto-fill from linked visa application ─────────────────────────
  let appName        = ''
  let appPassport    = ''
  let appArrivalDate: Date | null = null
  let appReturnDate:  Date | null = null
  let appDestIso2    = ''

  if (body.applicationId) {
    try {
      const app = await prisma.visaApplication.findUnique({ where: { id: body.applicationId } })
      if (app) {
        appName        = [app.firstName, app.middleName, app.lastName].filter(Boolean).join(' ')
        appPassport    = app.passportNumber ?? ''
        appArrivalDate = app.arrivalDate    ?? null
        appReturnDate  = app.returnDate     ?? null
        appDestIso2    = app.destinationIso2 ?? ''
      }
    } catch { /* non-fatal */ }
  }

  const reference = makeRef()

  // ─────────────────────────────────────────────────────────────────────────
  // HOTEL MODE
  // ─────────────────────────────────────────────────────────────────────────
  if (body.mode === 'hotel') {
    const clientName = body.clientName || appName || 'PASSENGER NAME'
    const checkIn    = body.checkIn    || (appArrivalDate ? appArrivalDate.toISOString().slice(0, 10) : '')
    const checkOut   = body.checkOut   || (appReturnDate  ? appReturnDate.toISOString().slice(0, 10) : '')
    const nights     = checkIn && checkOut
      ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
      : 0

    const ticketData: TicketData = {
      ticket_type:          'hotel',
      ticket_reference:     reference,
      client_name:          clientName,
      hotel_name:           body.hotelName    || 'Hotel Accommodation',
      hotel_address:        body.hotelAddress || '',
      checkin_date:         checkIn,
      checkout_date:        checkOut,
      checkin_time:         '14:00',
      checkout_time:        '12:00',
      num_nights:           String(nights),
      room_type:            body.roomType  || 'Standard Double Room',
      num_guests:           body.numGuests || '1',
      confirmation_number:  `HTL${Math.floor(100000 + Math.random() * 900000)}`,
    }

    try {
      const buf    = await renderTicketPDF(ticketData)
      const pdfUrl = await uploadPDF(buf, reference)
      return NextResponse.json({
        mode: 'hotel', reference, pdfUrl,
        pdf_base64: buf.toString('base64'),
        ticketData,
      })
    } catch (e) {
      return NextResponse.json({ error: `PDF error: ${String(e)}` }, { status: 500 })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MANUAL MODE
  // ─────────────────────────────────────────────────────────────────────────
  if (body.mode === 'manual') {
    const clientName = body.clientName || appName || 'PASSENGER NAME'
    const depIso     = body.departureDateTime || (appArrivalDate ? appArrivalDate.toISOString() : '')
    const arrIso     = body.arrivalDateTime   || ''

    const ticketData: TicketData = {
      ticket_type:       'flight',
      ticket_reference:  reference,
      client_name:       clientName,
      passport_number:   body.passportNumber || appPassport,
      from_code:         (body.fromCode   || '').toUpperCase(),
      from_city:         body.fromCity    || '',
      to_code:           (body.toCode     || appDestIso2 || '').toUpperCase(),
      to_city:           body.toCity      || '',
      airline:           body.airline     || '',
      flight_number:     body.flightNumber || '',
      departure_date:    depIso  ? fmtDate(depIso)  : '',
      departure_time:    depIso  ? fmtTime(depIso)  : '',
      arrival_date:      arrIso  ? fmtDate(arrIso)  : '',
      arrival_time:      arrIso  ? fmtTime(arrIso)  : '',
      duration:          body.duration     || '',
      cabin_class:       body.cabin        || 'ECONOMY',
      seat_number:       body.seat         || genSeat(),
      baggage_allowance: body.baggage      || '1 × 23kg checked + 7kg cabin',
      terminal:          body.terminal     || '',
      gate:              body.gate         || '',
      booking_reference: reference,
      pnr:               body.pnr          || genPNR(),
      message:           body.message      || '',
    }

    try {
      const buf    = await renderTicketPDF(ticketData)
      const pdfUrl = await uploadPDF(buf, reference)
      return NextResponse.json({
        mode: 'manual', reference, pdfUrl,
        pdf_base64: buf.toString('base64'),
        ticketData,
      })
    } catch (e) {
      return NextResponse.json({ error: `PDF error: ${String(e)}` }, { status: 500 })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE MODE — Duffel offer_request
  // ─────────────────────────────────────────────────────────────────────────
  const origin      = (body.originIata    || 'LOS').toUpperCase()
  const destination = (body.destIata      || appDestIso2 || 'LHR').toUpperCase()
  const depDate     = body.departureDate  || (appArrivalDate ? appArrivalDate.toISOString().slice(0, 10) : '')
  const retDate     = body.returnDate     || (appReturnDate  ? appReturnDate.toISOString().slice(0, 10)  : '')
  const cabin       = (body.cabinClass    || 'economy').toLowerCase()
  const clientName  = body.clientName     || appName || 'PASSENGER NAME'

  if (!depDate) {
    return NextResponse.json({ error: 'departureDate is required for live search' }, { status: 400 })
  }

  try {
    const slices: Array<{ origin: string; destination: string; departure_date: string }> = [
      { origin, destination, departure_date: depDate },
    ]
    if (retDate) slices.push({ origin: destination, destination: origin, departure_date: retDate })

    const result = await duffelPost<DuffelOfferResponse>(
      '/air/offer_requests',
      { data: { slices, passengers: [{ type: 'adult' }], cabin_class: cabin } },
      { return_offers: 'true', supplier_timeout: '12000' }
    )

    const offers = result.data?.offers ?? []
    if (offers.length === 0) {
      return NextResponse.json({
        error:      'No flights found for this route and date.',
        suggestion: 'Try a different date, or use Manual mode to enter details directly.',
      }, { status: 404 })
    }

    // Pick best offer by scoring
    const best = offers.slice(0, 30).reduce((a, b) => scoreOffer(a) >= scoreOffer(b) ? a : b)

    // Extract outbound details from first segment of first slice
    const outSlice  = best.slices[0]
    const firstSeg  = outSlice.segments[0]
    const lastSeg   = outSlice.segments[outSlice.segments.length - 1]
    const checkedBag = firstSeg.passengers[0]?.baggages?.find(b => b.type === 'checked')
    const carryOn    = firstSeg.passengers[0]?.baggages?.find(b => b.type === 'carry_on')
    const baggageStr = [
      checkedBag ? `${checkedBag.quantity} × 23kg checked` : null,
      carryOn    ? `${carryOn.quantity} × carry-on`        : null,
    ].filter(Boolean).join(' + ') || '1 × 23kg checked'

    const cabinLabel = { economy: 'ECONOMY', premium_economy: 'PREMIUM ECONOMY', business: 'BUSINESS', first: 'FIRST CLASS' }[best.cabin_class] ?? best.cabin_class.toUpperCase()
    const pnr        = genPNR()
    const seat       = genSeat()

    const flightDetails = {
      airline:       firstSeg.marketing_carrier.name,
      airlineCode:   firstSeg.marketing_carrier.iata_code,
      flightNumber:  `${firstSeg.marketing_carrier.iata_code}${firstSeg.marketing_carrier_flight_number}`,
      fromCode:      outSlice.origin.iata_code,
      fromCity:      outSlice.origin.city_name ?? outSlice.origin.name,
      toCode:        lastSeg.destination.iata_code,
      toCity:        lastSeg.destination.city_name ?? lastSeg.destination.name,
      departureAt:   firstSeg.departing_at,
      arrivalAt:     lastSeg.arriving_at,
      duration:      fmtDuration(outSlice.duration),
      stops:         outSlice.segments.length - 1,
      cabin:         cabinLabel,
      baggage:       baggageStr,
      price:         `${best.total_currency} ${Number(best.total_amount).toLocaleString()}`,
      offerId:       best.id,
      seat,
      pnr,
    }

    const ticketData: TicketData = {
      ticket_type:       'flight',
      ticket_reference:  reference,
      client_name:       clientName,
      passport_number:   body.passportNumber || appPassport,
      from_code:         flightDetails.fromCode,
      from_city:         flightDetails.fromCity,
      to_code:           flightDetails.toCode,
      to_city:           flightDetails.toCity,
      airline:           flightDetails.airline,
      flight_number:     flightDetails.flightNumber,
      departure_date:    fmtDate(flightDetails.departureAt),
      departure_time:    fmtTime(flightDetails.departureAt),
      arrival_date:      fmtDate(flightDetails.arrivalAt),
      arrival_time:      fmtTime(flightDetails.arrivalAt),
      duration:          flightDetails.duration,
      cabin_class:       flightDetails.cabin,
      seat_number:       seat,
      baggage_allowance: baggageStr,
      booking_reference: reference,
      pnr,
    }

    const buf    = await renderTicketPDF(ticketData)
    const pdfUrl = await uploadPDF(buf, reference)

    return NextResponse.json({
      mode: 'live', reference, pdfUrl,
      pdf_base64:     buf.toString('base64'),
      flight_details: flightDetails,
      ticketData,
    })
  } catch (e) {
    console.error('[dummy-ticket/live]', e)
    return NextResponse.json({
      error:      `Flight search failed: ${String(e)}`,
      suggestion: 'Use Manual mode to enter flight details directly.',
    }, { status: 500 })
  }
}
