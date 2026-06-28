import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { duffelTicketRateLimit } from '@/lib/rate-limit'
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

// ─── Safe string helper ────────────────────────────────────────────────────────
const safeUpper = (s: unknown): string => (s != null ? String(s) : '').toUpperCase()

// ─── ISO2 country → major IATA airport ───────────────────────────────────────
const COUNTRY_IATA: Record<string, string> = {
  GB: 'LHR', US: 'JFK', FR: 'CDG', DE: 'FRA', AE: 'DXB',
  CA: 'YYZ', AU: 'SYD', NL: 'AMS', ES: 'MAD', IT: 'FCO',
  PT: 'LIS', IE: 'DUB', BE: 'BRU', CH: 'ZRH', AT: 'VIE',
  SE: 'ARN', DK: 'CPH', NO: 'OSL', FI: 'HEL', PL: 'WAW',
  GH: 'ACC', NG: 'LOS', KE: 'NBO', ZA: 'JNB', ET: 'ADD',
  EG: 'CAI', MA: 'CMN', SN: 'DKR', TZ: 'DAR', UG: 'EBB',
  IN: 'BOM', PK: 'KHI', BD: 'DAC', LK: 'CMB', NP: 'KTM',
  CN: 'PEK', JP: 'NRT', KR: 'ICN', SG: 'SIN', MY: 'KUL',
  BR: 'GRU', MX: 'MEX', AR: 'EZE', CO: 'BOG', PE: 'LIM',
  QA: 'DOH', SA: 'RUH', TR: 'IST', RU: 'SVO', OM: 'MCT',
  BH: 'BAH', KW: 'KWI', JO: 'AMM', LB: 'BEY', CM: 'DLA',
  CI: 'ABJ', SL: 'FNA', RW: 'KGL', ZW: 'HRE', ZM: 'LUN',
}

// ─── Nationality string → nearest major IATA airport ─────────────────────────
const NATIONALITY_IATA: Record<string, string> = {
  Nigerian: 'LOS', Ghanaian: 'ACC', Kenyan: 'NBO', 'South African': 'JNB',
  Ethiopian: 'ADD', Egyptian: 'CAI', Moroccan: 'CMN', Senegalese: 'DKR',
  Tanzanian: 'DAR', Ugandan: 'EBB', Rwandan: 'KGL', Zimbabwean: 'HRE',
  Zambian: 'LUN', Cameroonian: 'DLA', Ivorian: 'ABJ', 'Sierra Leonean': 'FNA',
  British: 'LHR', American: 'JFK', Canadian: 'YYZ', Australian: 'SYD',
  French: 'CDG', German: 'FRA', Dutch: 'AMS', Spanish: 'MAD',
  Italian: 'FCO', Portuguese: 'LIS', Irish: 'DUB', Belgian: 'BRU',
  Swiss: 'ZRH', Austrian: 'VIE', Swedish: 'ARN', Norwegian: 'OSL',
  Indian: 'BOM', Pakistani: 'KHI', Bangladeshi: 'DAC', 'Sri Lankan': 'CMB',
  Nepali: 'KTM', Chinese: 'PEK', Japanese: 'NRT', Korean: 'ICN',
  Singaporean: 'SIN', Malaysian: 'KUL', Brazilian: 'GRU', Mexican: 'MEX',
  Qatari: 'DOH', 'Saudi Arabian': 'RUH', Turkish: 'IST', Lebanese: 'BEY',
  Omani: 'MCT', Kuwaiti: 'KWI',
}

// ─── Carrier code → full airline name ────────────────────────────────────────
const AIRLINE_NAMES: Record<string, string> = {
  BA: 'British Airways', EK: 'Emirates', QR: 'Qatar Airways',
  LH: 'Lufthansa', AF: 'Air France', KL: 'KLM Royal Dutch Airlines',
  ET: 'Ethiopian Airlines', TK: 'Turkish Airlines', UA: 'United Airlines',
  AA: 'American Airlines', DL: 'Delta Air Lines', SQ: 'Singapore Airlines',
  CX: 'Cathay Pacific', VS: 'Virgin Atlantic', MS: 'EgyptAir',
  W3: 'Arik Air', WT: 'Wasafiri', DY: 'Norwegian Air Shuttle',
  FR: 'Ryanair', U2: 'easyJet', VY: 'Vueling', IB: 'Iberia',
  AZ: 'ITA Airways', RO: 'TAROM', AM: 'Aeromexico',
  CM: 'Copa Airlines', LA: 'LATAM Airlines', JL: 'Japan Airlines',
  NH: 'ANA All Nippon Airways', KE: 'Korean Air', MH: 'Malaysia Airlines',
  WY: 'Oman Air', GF: 'Gulf Air', LX: 'Swiss International Air Lines',
  OS: 'Austrian Airlines', SK: 'Scandinavian Airlines', AY: 'Finnair',
  PR: 'Philippine Airlines', GA: 'Garuda Indonesia', VN: 'Vietnam Airlines',
}

// ─── Major carrier scoring ────────────────────────────────────────────────────
const PREFERRED_CARRIERS: Record<string, number> = {
  BA: 10, EK: 10, QR: 10, LH: 9, AF: 9, KL: 9, ET: 8,
  TK: 8, UA: 7, AA: 7, DL: 7, SQ: 10, CX: 9, VS: 8,
  W3: 6, WT: 5, DY: 4, FR: 3, U2: 3, VY: 3,
}

// ─── Utility ──────────────────────────────────────────────────────────────────
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
  const h   = m[1] ? `${m[1]}h ` : ''
  const min = m[2] ? `${m[2]}m`  : ''
  return `${h}${min}`.trim()
}

// ─── Score Duffel offer ───────────────────────────────────────────────────────
function scoreDuffelOffer(offer: {
  slices: Array<{ segments: Array<{ marketing_carrier: { iata_code: string } }> }>
}): number {
  const firstSeg = offer.slices[0]?.segments[0]
  if (!firstSeg) return 0
  const carrier = firstSeg.marketing_carrier.iata_code
  const stops   = offer.slices.reduce((acc, sl) => acc + Math.max(0, sl.segments.length - 1), 0)
  return (PREFERRED_CARRIERS[carrier] ?? 5) - stops * 2
}

// ─── Upload PDF to Supabase ───────────────────────────────────────────────────
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

// ─── Render PDF ───────────────────────────────────────────────────────────────
async function renderTicketPDF(ticketData: TicketData): Promise<Buffer> {
  const element = React.createElement(TicketPDFDocument, { data: ticketData })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any)
}

// ─── Duffel types ─────────────────────────────────────────────────────────────
interface DuffelPlace { iata_code: string; name: string; city_name?: string }
interface DuffelBaggage { type: 'carry_on' | 'checked'; quantity: number }
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
  data: {
    offers:     DuffelOffer[]
    passengers: Array<{ id: string; type: string }>
  }
}

// ─── Amadeus types ────────────────────────────────────────────────────────────
interface AmadeusSegment {
  departure:   { iataCode: string; at: string }
  arrival:     { iataCode: string; at: string }
  carrierCode: string
  number:      string
  duration:    string
}
interface AmadeusOffer {
  id:           string
  price:        { total: string; currency: string }
  itineraries:  Array<{ duration: string; segments: AmadeusSegment[] }>
  travelerPricings: Array<{
    fareDetailsBySegment: Array<{
      cabin: string
      includedCheckedBags?: { quantity: number }
    }>
  }>
}

// ─── Amadeus token cache ──────────────────────────────────────────────────────
let amadeusTokenCache: { token: string; expiresAt: number } | null = null

async function getAmadeusToken(): Promise<string> {
  if (amadeusTokenCache && Date.now() < amadeusTokenCache.expiresAt - 60000) {
    return amadeusTokenCache.token
  }
  const res = await fetch('https://api.amadeus.com/v1/security/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=client_credentials&client_id=${process.env.AMADEUS_API_KEY}&client_secret=${process.env.AMADEUS_API_SECRET}`,
    signal:  AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Amadeus auth failed: ${res.status}`)
  const data = await res.json() as { access_token: string; expires_in: number }
  amadeusTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

async function searchAmadeus(origin: string, dest: string, depDate: string, cabin: string, retDate?: string): Promise<AmadeusOffer[]> {
  const cabinMap: Record<string, string> = {
    economy: 'ECONOMY', premium_economy: 'PREMIUM_ECONOMY', business: 'BUSINESS', first: 'FIRST',
  }
  const token  = await getAmadeusToken()
  const params = new URLSearchParams({
    originLocationCode:      origin,
    destinationLocationCode: dest,
    departureDate:           depDate,
    adults:                  '1',
    currencyCode:            'GBP',
    max:                     '30',
    travelClass:             cabinMap[cabin] ?? 'ECONOMY',
  })
  if (retDate) params.set('returnDate', retDate)
  const res = await fetch(`https://api.amadeus.com/v2/shopping/flight-offers?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Amadeus search failed: ${res.status}`)
  const data = await res.json() as { data?: AmadeusOffer[] }
  return data.data ?? []
}

// ─── Shared flight details shape — includes return leg fields ─────────────────
interface FlightDetails {
  airline:      string
  airlineCode:  string
  flightNumber: string
  fromCode:     string
  fromCity:     string
  toCode:       string
  toCity:       string
  departureAt:  string
  arrivalAt:    string
  duration:     string
  stops:        number
  cabin:        string
  baggage:      string
  price:        string
  offerId:      string
  seat:         string
  pnr:          string
  // Return leg (populated when round-trip is searched)
  returnDepartureAt?:  string
  returnArrivalAt?:    string
  returnFlightNumber?: string
  returnAirline?:      string
  returnDuration?:     string
  returnStops?:        number
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = duffelTicketRateLimit(session.email)
  if (!rl.allowed) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000)
    return NextResponse.json(
      { error: `Rate limit reached. Max 20 dummy tickets per hour per staff member.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const body = await req.json() as {
    mode:           'live' | 'manual' | 'hotel'
    applicationId?: string
    // Live
    originIata?:    string
    destIata?:      string
    departureDate?: string
    returnDate?:    string
    cabinClass?:    string
    holdPnr?:       boolean   // create a real hold order via Duffel
    // Manual
    clientName?:        string
    passportNumber?:    string
    fromCode?:          string
    fromCity?:          string
    toCode?:            string
    toCity?:            string
    airline?:           string
    flightNumber?:      string
    departureDateTime?: string
    arrivalDateTime?:   string
    duration?:          string
    cabin?:             string
    seat?:              string
    baggage?:           string
    terminal?:          string
    gate?:              string
    pnr?:               string
    message?:           string
    // Hotel
    hotelName?:    string
    hotelAddress?: string
    checkIn?:      string
    checkOut?:     string
    roomType?:     string
    numGuests?:    string
    // Multi-passenger
    passengers?: Array<{
      name: string
      type?: string   // 'Adult' | 'Child' | 'Infant'
      seat?: string
      passport?: string
    }>
  }

  // ── Optional: auto-fill from linked visa application ──────────────────────
  let appName        = ''
  let appFirstName   = ''
  let appLastName    = ''
  let appPassport    = ''
  let appArrivalDate: Date | null = null
  let appReturnDate:  Date | null = null
  let appDestIso2    = ''
  let appBranch      = ''
  let appDateOfBirth = ''
  let appGender      = 'm'
  let appEmail       = ''
  let appPhone       = ''

  if (body.applicationId) {
    try {
      const app = await prisma.visaApplication.findUnique({ where: { id: body.applicationId } })
      if (app) {
        appFirstName   = app.firstName       ?? ''
        appLastName    = app.lastName        ?? ''
        appName        = [app.firstName, app.middleName, app.lastName].filter(Boolean).join(' ')
        appPassport    = app.passportNumber  ?? ''
        appArrivalDate = app.arrivalDate     ?? null
        appReturnDate  = app.returnDate      ?? null
        appDestIso2    = app.destinationIso2 ?? ''
        appBranch      = (app as Record<string, unknown>).branch as string ?? ''
        appDateOfBirth = String((app as Record<string, unknown>).dateOfBirth ?? '').slice(0, 10)
        const rawSex   = String((app as Record<string, unknown>).sex ?? '')
        appGender      = rawSex.toLowerCase().startsWith('f') ? 'f' : 'm'
        appEmail       = String((app as Record<string, unknown>).email ?? '')
        appPhone       = String((app as Record<string, unknown>).phone ?? '')
      }
    } catch { /* non-fatal */ }
  }

  const reference = makeRef()

  // ───────────────────────────────────────────────────────────────────────────
  // HOTEL MODE
  // ───────────────────────────────────────────────────────────────────────────
  if (body.mode === 'hotel') {
    const clientName = body.clientName || appName || 'PASSENGER NAME'
    const checkIn    = body.checkIn  || (appArrivalDate ? appArrivalDate.toISOString().slice(0, 10) : '')
    const checkOut   = body.checkOut || (appReturnDate  ? appReturnDate.toISOString().slice(0, 10)  : '')
    const nights     = checkIn && checkOut
      ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
      : 0

    const ticketData: TicketData = {
      ticket_type:         'hotel',
      ticket_reference:    reference,
      client_name:         clientName,
      hotel_name:          body.hotelName    || 'Hotel Accommodation',
      hotel_address:       body.hotelAddress || '',
      checkin_date:        checkIn,
      checkout_date:       checkOut,
      checkin_time:        '14:00',
      checkout_time:       '12:00',
      num_nights:          String(nights),
      room_type:           body.roomType  || 'Standard Double Room',
      num_guests:          body.numGuests || '1',
      confirmation_number: `HTL${Math.floor(100000 + Math.random() * 900000)}`,
    }

    try {
      const buf    = await renderTicketPDF(ticketData)
      const pdfUrl = await uploadPDF(buf, reference)
      return NextResponse.json({ mode: 'hotel', reference, pdfUrl, pdf_base64: buf.toString('base64'), ticketData })
    } catch (e) {
      return NextResponse.json({ error: `PDF error: ${String(e)}` }, { status: 500 })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // MANUAL MODE
  // ───────────────────────────────────────────────────────────────────────────
  if (body.mode === 'manual') {
    const clientName = body.clientName || appName || 'PASSENGER NAME'
    const depIso     = body.departureDateTime || (appArrivalDate ? appArrivalDate.toISOString() : '')
    const arrIso     = body.arrivalDateTime   || ''

    const ticketData: TicketData = {
      ticket_type:       'flight',
      ticket_reference:  reference,
      client_name:       clientName,
      passport_number:   safeUpper(body.passportNumber || appPassport),
      from_code:         safeUpper(body.fromCode),
      from_city:         body.fromCity || '',
      to_code:           safeUpper(body.toCode || (appDestIso2 ? (COUNTRY_IATA[appDestIso2] || appDestIso2) : '')),
      to_city:           body.toCity   || '',
      airline:           body.airline  || '',
      flight_number:     body.flightNumber || '',
      departure_date:    depIso ? fmtDate(depIso) : '',
      departure_time:    depIso ? fmtTime(depIso) : '',
      arrival_date:      arrIso ? fmtDate(arrIso) : '',
      arrival_time:      arrIso ? fmtTime(arrIso) : '',
      duration:          body.duration || '',
      cabin_class:       safeUpper(body.cabin || 'ECONOMY'),
      seat_number:       body.seat    || genSeat(),
      baggage_allowance: body.baggage || '1 × 23kg checked + 7kg cabin',
      terminal:          body.terminal || '',
      gate:              body.gate    || '',
      booking_reference: reference,
      pnr:               body.pnr    || genPNR(),
      message:           body.message || '',
      stops:             '0',
    }

    const bodyPax = body.passengers ?? []
    const allPax  = bodyPax.length > 0 ? bodyPax : [{ name: clientName, type: 'Adult' }]
    const paxForPDF = allPax.map((p) => {
      const parts     = (p.name || 'PASSENGER').trim().split(' ')
      const firstName = parts[0]
      const lastName  = parts.slice(1).join(' ') || ''
      return {
        title:         'MR',
        firstName:     firstName.toUpperCase(),
        lastName:      lastName.toUpperCase(),
        cabinClass:    safeUpper(body.cabin || 'ECONOMY'),
        seat:          p.seat || genSeat(),
        eTicketNumber: `999${Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('')}`,
        passport:      p.passport || safeUpper(body.passportNumber || appPassport),
      }
    })
    ticketData.passengers = paxForPDF

    try {
      const buf    = await renderTicketPDF(ticketData)
      const pdfUrl = await uploadPDF(buf, reference)
      return NextResponse.json({ mode: 'manual', reference, pdfUrl, pdf_base64: buf.toString('base64'), ticketData })
    } catch (e) {
      return NextResponse.json({ error: `PDF error: ${String(e)}` }, { status: 500 })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LIVE MODE — Duffel first, Amadeus fallback
  // ───────────────────────────────────────────────────────────────────────────

  // Branch office → departure airport (reliable: branch = where Walz manages this client)
  const BRANCH_IATA: Record<string, string> = {
    nigeria: 'LOS', ghana: 'ACC', uk: 'LHR', uae: 'DXB', canada: 'YYZ',
  }
  const branchOrigin = appBranch ? (BRANCH_IATA[appBranch.toLowerCase()] ?? '') : ''

  const origin      = safeUpper(body.originIata) || branchOrigin
  const destination = safeUpper(body.destIata)   || (appDestIso2 ? (COUNTRY_IATA[appDestIso2] || safeUpper(appDestIso2)) : '')
  const depDate     = body.departureDate || (appArrivalDate ? appArrivalDate.toISOString().slice(0, 10) : '')
  const retDate     = body.returnDate    || (appReturnDate  ? appReturnDate.toISOString().slice(0, 10)  : '')
  const cabin       = (body.cabinClass   || 'economy').toLowerCase()
  const clientName  = body.clientName    || appName || 'PASSENGER NAME'

  if (!origin) {
    return NextResponse.json({
      error: 'Origin airport (From IATA) is required. Please enter where the client is flying FROM — e.g. LHR, LOS, ACC, YYZ, DXB.',
    }, { status: 400 })
  }
  if (!destination) {
    return NextResponse.json({
      error: 'Destination airport (To IATA) is required. Please enter where the client is flying TO — e.g. LHR, CDG, JFK, DXB.',
    }, { status: 400 })
  }
  if (!depDate) {
    return NextResponse.json({ error: 'departureDate is required for live search' }, { status: 400 })
  }

  const slices: Array<{ origin: string; destination: string; departure_date: string }> = [
    { origin, destination, departure_date: depDate },
  ]
  if (retDate) slices.push({ origin: destination, destination: origin, departure_date: retDate })

  const tried: string[] = []
  let flightDetails:      FlightDetails | null = null
  let duffelPassengerId:  string | null        = null
  let duffelBestOfferId:  string | null        = null

  // ── Try Duffel ──────────────────────────────────────────────────────────────
  if (process.env.DUFFEL_ACCESS_TOKEN) {
    tried.push('Duffel')
    try {
      const result = await Promise.race([
        duffelPost<DuffelOfferResponse>(
          '/air/offer_requests',
          { data: { slices, passengers: [{ type: 'adult' }], cabin_class: cabin } },
          { return_offers: 'true', supplier_timeout: '12000' }
        ),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Duffel timeout')), 20000)),
      ])
      // Capture passenger ID for later hold order
      duffelPassengerId = result.data?.passengers?.[0]?.id ?? null
      const offers = result.data?.offers ?? []
      if (offers.length > 0) {
        const best      = offers.slice(0, 30).reduce((a, b) => scoreDuffelOffer(a) >= scoreDuffelOffer(b) ? a : b)
        const rawSlice0 = best.slices[0]
        const rawSlice1 = best.slices[1] ?? null

        // Duffel can return slices in reversed order — detect and correct
        const slice0OriginCode = rawSlice0.segments[0]?.origin?.iata_code ?? ''
        const slice1OriginCode = rawSlice1?.segments[0]?.origin?.iata_code ?? ''
        const slicesAreReversed =
          rawSlice1 != null &&
          slice0OriginCode !== origin &&
          (slice1OriginCode === origin || slice0OriginCode === destination)
        const orderedSlices = slicesAreReversed
          ? [rawSlice1, rawSlice0] as const
          : [rawSlice0, rawSlice1] as const

        const outSlice = orderedSlices[0]
        const firstSeg = outSlice.segments[0]
        const lastSeg  = outSlice.segments[outSlice.segments.length - 1]
        const checked  = firstSeg.passengers[0]?.baggages?.find(b => b.type === 'checked')
        const carry    = firstSeg.passengers[0]?.baggages?.find(b => b.type === 'carry_on')
        const bagStr   = [
          checked ? `${checked.quantity} × 23kg checked` : null,
          carry   ? `${carry.quantity} × carry-on`       : null,
        ].filter(Boolean).join(' + ') || '1 × 23kg checked'
        const cabinLbl = {
          economy: 'ECONOMY', premium_economy: 'PREMIUM ECONOMY',
          business: 'BUSINESS', first: 'FIRST CLASS',
        }[best.cabin_class] ?? safeUpper(best.cabin_class)

        flightDetails = {
          airline:      firstSeg.marketing_carrier.name,
          airlineCode:  firstSeg.marketing_carrier.iata_code,
          flightNumber: `${firstSeg.marketing_carrier.iata_code}${firstSeg.marketing_carrier_flight_number}`,
          fromCode:     outSlice.origin.iata_code,
          fromCity:     outSlice.origin.city_name ?? outSlice.origin.name,
          toCode:       lastSeg.destination.iata_code,
          toCity:       lastSeg.destination.city_name ?? lastSeg.destination.name,
          departureAt:  firstSeg.departing_at,
          arrivalAt:    lastSeg.arriving_at,
          duration:     fmtDuration(outSlice.duration),
          stops:        outSlice.segments.length - 1,
          cabin:        cabinLbl,
          baggage:      bagStr,
          price:        `${best.total_currency} ${Number(best.total_amount).toLocaleString()}`,
          offerId:      best.id,
          seat:         genSeat(),
          pnr:          genPNR(),
        }
        duffelBestOfferId = best.id

        // ── Capture return leg from ordered slice[1] ───────────────────────
        if (retDate && orderedSlices[1]) {
          const retSlice = orderedSlices[1]
          const retFirst = retSlice.segments[0]
          const retLast  = retSlice.segments[retSlice.segments.length - 1]
          flightDetails.returnDepartureAt  = retFirst.departing_at
          flightDetails.returnArrivalAt    = retLast.arriving_at
          flightDetails.returnFlightNumber = `${retFirst.marketing_carrier.iata_code}${retFirst.marketing_carrier_flight_number}`
          flightDetails.returnAirline      = retFirst.marketing_carrier.name
          flightDetails.returnDuration     = fmtDuration(retSlice.duration)
          flightDetails.returnStops        = retSlice.segments.length - 1
        }
      }
    } catch (e) {
      console.warn('[dummy-ticket/duffel]', e)
    }
  }

  // ── Amadeus fallback ────────────────────────────────────────────────────────
  if (!flightDetails && process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET) {
    tried.push('Amadeus')
    try {
      const amOffers = await searchAmadeus(origin, destination, depDate, cabin, retDate || undefined)
      if (amOffers.length > 0) {
        const scoreOf = (o: AmadeusOffer) =>
          (PREFERRED_CARRIERS[o.itineraries[0]?.segments[0]?.carrierCode] ?? 5) -
          ((o.itineraries[0]?.segments.length ?? 1) - 1) * 2
        const best      = amOffers.reduce((a, b) => scoreOf(a) >= scoreOf(b) ? a : b)
        const amItin0   = best.itineraries[0]
        const amItin1   = best.itineraries[1] ?? null

        // Amadeus can also return itineraries reversed — detect and correct
        const amOrigin0 = amItin0?.segments[0]?.departure?.iataCode ?? ''
        const amOrigin1 = amItin1?.segments[0]?.departure?.iataCode ?? ''
        const amReversed =
          amItin1 != null &&
          amOrigin0 !== origin &&
          (amOrigin1 === origin || amOrigin0 === destination)
        const amItins = amReversed
          ? [amItin1, amItin0] as const
          : [amItin0, amItin1] as const

        const itin     = amItins[0]
        const firstSeg = itin.segments[0]
        const lastSeg  = itin.segments[itin.segments.length - 1]
        const bags     = best.travelerPricings[0]?.fareDetailsBySegment[0]?.includedCheckedBags?.quantity ?? 1
        const cabinLbl = (best.travelerPricings[0]?.fareDetailsBySegment[0]?.cabin ?? 'ECONOMY').replace(/_/g, ' ')

        flightDetails = {
          airline:      AIRLINE_NAMES[firstSeg.carrierCode] ?? firstSeg.carrierCode,
          airlineCode:  firstSeg.carrierCode,
          flightNumber: `${firstSeg.carrierCode}${firstSeg.number}`,
          fromCode:     firstSeg.departure.iataCode,
          fromCity:     firstSeg.departure.iataCode,
          toCode:       lastSeg.arrival.iataCode,
          toCity:       lastSeg.arrival.iataCode,
          departureAt:  firstSeg.departure.at,
          arrivalAt:    lastSeg.arrival.at,
          duration:     fmtDuration(itin.duration),
          stops:        itin.segments.length - 1,
          cabin:        cabinLbl,
          baggage:      `${bags} × 23kg checked + 7kg cabin`,
          price:        `${best.price.currency} ${Number(best.price.total).toLocaleString()}`,
          offerId:      best.id,
          seat:         genSeat(),
          pnr:          genPNR(),
        }

        // ── Capture return leg from ordered itineraries[1] ─────────────────
        if (retDate && amItins[1]) {
          const retItin  = amItins[1]
          const retFirst = retItin.segments[0]
          const retLast  = retItin.segments[retItin.segments.length - 1]
          flightDetails.returnDepartureAt  = retFirst.departure.at
          flightDetails.returnArrivalAt    = retLast.arrival.at
          flightDetails.returnFlightNumber = `${retFirst.carrierCode}${retFirst.number}`
          flightDetails.returnAirline      = AIRLINE_NAMES[retFirst.carrierCode] ?? retFirst.carrierCode
          flightDetails.returnDuration     = fmtDuration(retItin.duration)
          flightDetails.returnStops        = retItin.segments.length - 1
        }
      }
    } catch (e) {
      console.warn('[dummy-ticket/amadeus]', e)
    }
  }

  // ── Duffel Hold order — real airline PNR (optional) ────────────────────────
  let holdPNR:     string | null = null
  let holdExpires: string | null = null
  let holdOrderId: string | null = null
  let holdFailed                 = false

  if (body.holdPnr && flightDetails && duffelPassengerId && duffelBestOfferId && process.env.DUFFEL_ACCESS_TOKEN) {
    const givenName  = appFirstName || clientName.split(' ')[0]            || 'Given'
    const familyName = appLastName  || clientName.split(' ').slice(1).join(' ') || 'Family'
    const dob        = appDateOfBirth  // required — hold fails without it

    if (dob && givenName && familyName) {
      try {
        interface DuffelHoldPassenger {
          id:                   string
          given_name:           string
          family_name:          string
          born_on:              string
          gender:               string
          email:                string
          phone_number:         string
          title:                string
          identity_documents?:  Array<{ unique_identifier: string; type: string; issuing_country_code: string; expires_on: string }>
        }
        interface DuffelHoldResponse {
          data: {
            id:                string
            booking_reference: string
            payment_status?:   { payment_required_by?: string }
          }
        }

        const passenger: DuffelHoldPassenger = {
          id:           duffelPassengerId,
          given_name:   givenName,
          family_name:  familyName,
          born_on:      dob,
          gender:       appGender,
          email:        (appEmail && appEmail !== 'undefined') ? appEmail : 'booking@walztravels.com',
          phone_number: (appPhone && appPhone !== 'undefined') ? appPhone : '+447398753797',
          title:        appGender === 'f' ? 'ms' : 'mr',
        }
        if (appPassport) {
          passenger.identity_documents = [{
            unique_identifier:    appPassport,
            type:                 'passport',
            issuing_country_code: 'GB',
            expires_on:           '2030-01-01',
          }]
        }

        const holdResp = await Promise.race([
          duffelPost<DuffelHoldResponse>(
            '/air/orders',
            { data: { type: 'hold', selected_offers: [duffelBestOfferId], passengers: [passenger] } },
          ),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Hold timeout')), 15000)),
        ])

        if (holdResp?.data?.booking_reference) {
          holdPNR     = holdResp.data.booking_reference
          holdOrderId = holdResp.data.id
          holdExpires = holdResp.data.payment_status?.payment_required_by ?? null
          flightDetails.pnr = holdPNR  // overwrite generated PNR with real one
        } else {
          holdFailed = true
        }
      } catch (e) {
        console.error('[dummy-ticket/hold]', e)
        holdFailed = true
      }
    } else {
      // Missing passenger DOB — can't create hold
      holdFailed = true
      console.warn('[dummy-ticket/hold] Missing DOB — cannot create hold order')
    }
  }

  // ── No results ──────────────────────────────────────────────────────────────
  if (!flightDetails) {
    return NextResponse.json({
      error:      `No flights found for ${origin} → ${destination} on ${depDate}.`,
      tried,
      params:     { origin, destination, departureDate: depDate },
      suggestion: 'Try different dates or a nearby airport. You can also switch to Manual mode to enter any flight details.',
    }, { status: 404 })
  }

  // ── Build ticketData and render PDF ────────────────────────────────────────
  try {
    const hasReturn = !!flightDetails.returnDepartureAt

    const ticketData: TicketData = {
      ticket_type:       'flight',
      ticket_reference:  reference,
      client_name:       clientName,
      passport_number:   safeUpper(body.passportNumber || appPassport),
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
      seat_number:       flightDetails.seat,
      baggage_allowance: flightDetails.baggage,
      booking_reference: reference,
      pnr:               flightDetails.pnr,
      stops:             String(flightDetails.stops),
      // Return leg — populate when round-trip data is available
      ...(hasReturn ? {
        return_date:         fmtDate(flightDetails.returnDepartureAt!),
        return_time:         fmtTime(flightDetails.returnDepartureAt!),
        return_arrival_date: fmtDate(flightDetails.returnArrivalAt!),
        return_arrival_time: fmtTime(flightDetails.returnArrivalAt!),
        return_flight:       flightDetails.returnFlightNumber,
        return_airline:      flightDetails.returnAirline,
        return_duration:     flightDetails.returnDuration,
        return_stops:        String(flightDetails.returnStops ?? 0),
        return_pnr:          genPNR(),
        return_seat_number:  genSeat(),
      } : {}),
    }

    ticketData.passengers = [{
      title:         'MR',
      firstName:     clientName.split(' ')[0]?.toUpperCase() || 'PASSENGER',
      lastName:      clientName.split(' ').slice(1).join(' ').toUpperCase() || '',
      cabinClass:    safeUpper(cabin),
      seat:          flightDetails.seat,
      eTicketNumber: `999${Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('')}`,
      passport:      safeUpper(body.passportNumber || appPassport),
    }]

    const buf    = await renderTicketPDF(ticketData)
    const pdfUrl = await uploadPDF(buf, reference)

    return NextResponse.json({
      mode:           'live',
      source:         tried[tried.length - 1],
      reference,
      pdfUrl,
      pdf_base64:     buf.toString('base64'),
      flight_details: flightDetails,
      ticketData,
      // Hold PNR result
      ...(holdPNR    ? { hold_pnr: holdPNR, hold_expires: holdExpires, hold_order_id: holdOrderId } : {}),
      ...(holdFailed ? { hold_failed: true } : {}),
    })
  } catch (e) {
    console.error('[dummy-ticket/pdf]', e)
    return NextResponse.json({ error: `PDF error: ${String(e)}` }, { status: 500 })
  }
}
