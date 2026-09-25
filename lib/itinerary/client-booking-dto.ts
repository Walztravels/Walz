/**
 * Client-facing (proposal page + PDF), margin and mirror-sync builders for
 * unified flight / research-hotel bookings.
 *
 * SECURITY: every builder here is a WHITELIST. Fields are picked one by one;
 * the raw row is never spread. Nothing supplier-side (supplierCost,
 * pricing.*, taxes, markup, offer snapshot, rateKey, supplier/hotel codes,
 * passenger/offer ids) can reach a client DTO.
 * PRICE: a unified booking's price is the booking-level `cost`, once.
 * Journeys/segments never carry or contribute a price.
 */
import {
  isUnifiedFlight,
  isUnifiedHotel,
  journeyLabel,
  flightTripTypeLabel,
  flightRouteLabel,
  type FlightJourney,
} from './unified-booking'
import type { ProposalFlight, ProposalHotel, ProposalJourney } from '@/app/itinerary/[ref]/_types'

type Row = Record<string, unknown>

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined
const numOrUndef = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
// Tolerates numeric strings (Jade writes string costs), like the pre-change `cost != null && cost > 0`.
const clientPriceOf = (cost: unknown): number | undefined => {
  if (cost == null || cost === '') return undefined
  const n = typeof cost === 'number' ? cost : Number(cost)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// ── Journeys (client-safe) ───────────────────────────────────────────────────

export function buildProposalJourneys(journeys: FlightJourney[]): ProposalJourney[] {
  return journeys.map((j) => ({
    label: journeyLabel(j),
    direction: j.direction,
    stops: typeof j.stops === 'number' ? j.stops : Math.max(0, (j.segments?.length ?? 1) - 1),
    durationMinutes: numOrUndef(j.durationMinutes),
    segments: (j.segments ?? []).map((sg) => ({
      from: sg.from,
      to: sg.to,
      fromCity: str(sg.fromCity),
      toCity: str(sg.toCity),
      airline: sg.airline,
      flightNumber: sg.flightNumber,
      date: str(sg.date),
      departureTime: str(sg.time),
      arrivalTime: str(sg.arrivalTime),
      arrivalDate: str(sg.arrivalAt)?.slice(0, 10),
      durationMinutes: numOrUndef(sg.durationMinutes),
      cabin: str(sg.cabin),
      baggage: str(sg.baggage),
    })),
  }))
}

/** Last arrival airport of the trip's "main" direction (outbound for return). */
function routeEnds(row: { tripType: string; journeys: FlightJourney[] }): { from?: string; to?: string } {
  const js = row.journeys
  const first = js[0]?.segments[0]?.from
  const lastSeg = (j?: FlightJourney) => j?.segments[j.segments.length - 1]
  const to = row.tripType === 'multi-city' ? lastSeg(js[js.length - 1])?.to : lastSeg(js[0])?.to
  return { from: first, to }
}

// ── Proposal flight ──────────────────────────────────────────────────────────

export function buildProposalFlight(f: Row, opts: { accepted: boolean }): ProposalFlight {
  const pnr = opts.accepted ? (f.pnr as string | undefined) : undefined // credential: post-acceptance only
  if (isUnifiedFlight(f)) {
    const first = f.journeys[0]?.segments[0]
    const ends = routeEnds(f)
    return {
      bookingKind: 'unified-flight',
      tripType: f.tripType,
      tripTypeLabel: flightTripTypeLabel(f.tripType),
      routeLabel: flightRouteLabel(f),
      journeys: buildProposalJourneys(f.journeys),
      from: ends.from,
      to: ends.to,
      airline: first?.airline ?? str(f.airline),
      flightNumber: first?.flightNumber ?? str(f.flightNumber),
      date: first?.date ?? str(f.date),
      class: str(f.class) ?? str(first?.cabin),
      pnr,
      airlineLogoUrl: str(f.airlineLogoUrl),
      imageUrl: str(f.imageUrl),
      status: str(f.status),
      clientPrice: clientPriceOf(f.cost), // booking-level, ONCE
    }
  }
  const r = f as {
    from?: string; to?: string; fromCity?: string; toCity?: string
    airline?: string; flightNumber?: string; date?: string
    time?: string; departureTime?: string; arrivalTime?: string
    class?: string; stops?: number; airlineLogoUrl?: string; imageUrl?: string
    cost?: number | null
  }
  return {
    from: r.from, to: r.to, fromCity: r.fromCity, toCity: r.toCity,
    airline: r.airline, flightNumber: r.flightNumber, date: r.date,
    departureTime: r.departureTime ?? r.time, arrivalTime: r.arrivalTime,
    class: r.class, pnr, stops: r.stops,
    airlineLogoUrl: r.airlineLogoUrl, imageUrl: r.imageUrl,
    clientPrice: clientPriceOf(r.cost),
  }
}

// ── Proposal hotel ───────────────────────────────────────────────────────────

export function buildProposalHotel(h: Row): ProposalHotel {
  if (isUnifiedHotel(h)) {
    const rate = h.rate
    const images = Array.isArray(h.images) && h.images.length
      ? (h.images as unknown[]).filter((x): x is string => typeof x === 'string')
      : typeof h.image === 'string' && h.image ? [h.image] : undefined
    return {
      name: str(h.name),
      location: str(h.location),
      checkIn: str(h.checkIn),
      checkOut: str(h.checkOut),
      roomType: str(h.roomType) ?? str(rate.roomName),
      nights: numOrUndef(h.nights),
      mealPlan: str(rate.boardName),
      images,
      stars: numOrUndef(h.stars),
      breakfastIncluded: typeof rate.breakfastIncluded === 'boolean' ? rate.breakfastIncluded : undefined,
      isRefundable: typeof rate.isRefundable === 'boolean' ? rate.isRefundable : undefined,
      cancellationPolicy: str(rate.cancellationPolicy),
      cancellationDeadline: str(rate.cancellationDeadline),
      guests: rate.occupancy
        ? { rooms: rate.occupancy.rooms, adults: rate.occupancy.adults, children: rate.occupancy.children }
        : undefined,
      clientPrice: clientPriceOf(h.cost), // booking-level, ONCE
    }
  }
  const r = h as {
    name?: string; location?: string; checkIn?: string; checkOut?: string
    roomType?: string; nights?: number; mealPlan?: string; images?: string[]; cost?: number | null
  }
  return {
    name: r.name, location: r.location, checkIn: r.checkIn, checkOut: r.checkOut,
    roomType: r.roomType, nights: r.nights, mealPlan: r.mealPlan, images: r.images,
    clientPrice: clientPriceOf(r.cost),
  }
}

// ── PDF flight ───────────────────────────────────────────────────────────────

export interface PdfFlight {
  from?: string; to?: string; airline?: string; flightNumber?: string
  date?: string; time?: string; departureTime?: string; arrivalTime?: string
  class?: string; pnr?: string; cost?: number; stops?: number
  routeLabel?: string
  tripTypeLabel?: string
  journeys?: ProposalJourney[]
}

export function buildPdfFlight(f: Row, opts: { accepted: boolean }): PdfFlight {
  if (isUnifiedFlight(f)) {
    const p = buildProposalFlight(f, opts)
    return {
      from: p.from, to: p.to, airline: p.airline, flightNumber: p.flightNumber,
      date: p.date, class: p.class, pnr: p.pnr,
      routeLabel: p.routeLabel, tripTypeLabel: p.tripTypeLabel, journeys: p.journeys,
      cost: p.clientPrice ?? (typeof f.cost === 'number' ? f.cost : undefined),
    }
  }
  const r = f as {
    from?: string; to?: string; airline?: string; flightNumber?: string
    date?: string; time?: string; departureTime?: string; arrivalTime?: string
    class?: string; pnr?: string; cost?: number; stops?: number
  }
  return {
    from: r.from, to: r.to, airline: r.airline, flightNumber: r.flightNumber,
    date: r.date, time: r.time, departureTime: r.departureTime, arrivalTime: r.arrivalTime,
    class: r.class,
    pnr: opts.accepted ? r.pnr : undefined,
    cost: typeof r.cost === 'number' ? r.cost : clientPriceOf(r.cost),
    stops: r.stops,
  }
}

/** Plain-text lines for a unified PDF flight card (used by the PDF and tests). */
export function pdfJourneyLines(j: ProposalJourney): string[] {
  const lines = [j.label]
  j.segments.forEach((sg, i) => {
    const when = [sg.date, sg.departureTime && `${sg.departureTime}${sg.arrivalTime ? ` - ${sg.arrivalTime}` : ''}`].filter(Boolean).join('  ')
    lines.push(`${sg.flightNumber || sg.airline}  ${sg.from} > ${sg.to}${when ? `  ${when}` : ''}`)
    if (i < j.segments.length - 1) lines.push(`Connection in ${sg.to}`)
  })
  return lines
}

// ── Margin (JSON fallback) ───────────────────────────────────────────────────

export type MarginRow = {
  category: string
  description: string
  client_price: number | null
  supplier_cost: number | null
}
type AnyItem = Record<string, unknown>

/**
 * One margin row per JSON row (booking): a unified booking's booking-level
 * cost/supplierCost is counted ONCE, never per journey/segment.
 */
export function buildBlobMarginRows(cats: Array<{ category: string; items: AnyItem[]; descKey: string }>): MarginRow[] {
  const rows: MarginRow[] = []
  for (const { category, items, descKey } of cats) {
    for (const item of items) {
      const cp = item.cost != null ? Number(item.cost) : null
      const sc = item.supplierCost != null ? Number(item.supplierCost) : null
      if (cp == null && sc == null) continue
      let description = String(item[descKey] ?? '')
      if (category === 'flight' && isUnifiedFlight(item)) {
        description = `${item.airline ?? ''} ${flightRouteLabel(item)}`.trim()
      }
      rows.push({ category, description, client_price: cp, supplier_cost: sc })
    }
  }
  return rows
}

// ── Normalized mirror (itinerary_flights) ────────────────────────────────────

function parseDate(v: unknown): string | null {
  if (!v || typeof v !== 'string' || v.trim() === '') return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

/**
 * ONE mirror row per JSON flight row (external_id = row id). For a unified
 * booking from/to describe the route (not just its first leg); cost and
 * supplier cost are the booking-level values, once. Legacy rows unchanged.
 */
export function buildFlightMirrorRow(itineraryId: string, f: AnyItem, i: number) {
  let from = String(f.from ?? '')
  let to = String(f.to ?? '')
  if (isUnifiedFlight(f)) {
    const ends = routeEnds(f)
    from = ends.from ?? from
    to = ends.to ?? to
  }
  return {
    itinerary_id:     itineraryId,
    external_id:      String(f.id ?? ''),
    from,
    to,
    airline:          String(f.airline ?? ''),
    iata_code:        String(f.iataCode ?? ''),
    flight_number:    String(f.flightNumber ?? ''),
    date:             parseDate(f.date),
    departure_time:   String(f.time ?? ''),
    arrival_time:     String(f.arrivalTime ?? ''),
    class:            String(f.class ?? ''),
    pnr:              String(f.pnr ?? ''),
    client_price:     f.cost != null ? Number(f.cost) : null,
    supplier_cost:    f.supplierCost != null ? Number(f.supplierCost) : null,
    status:           String(f.status ?? 'pending'),
    notes:            String(f.notes ?? ''),
    supplier_id:      String(f.supplierId ?? '') || null,
    duffel_order_id:  String(f.duffelOrderId ?? '') || null,
    order:            i,
    updated_at:       new Date().toISOString(),
  }
}

// ── Portal / email / voucher (no price is shown there today) ─────────────────

/** Portal flight: whitelisted DTO, price and PNR never included. */
export function buildPortalFlight(f: Row): ProposalFlight {
  const { clientPrice: _p, pnr: _n, ...rest } = buildProposalFlight(f, { accepted: false })
  void _p; void _n
  return rest
}

export function buildPortalHotel(h: Row): ProposalHotel {
  const { clientPrice: _p, ...rest } = buildProposalHotel(h)
  void _p
  return rest
}

const escHtml = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Client email <tr> rows for a flight row. Legacy = the original single row; unified = ALL journeys/segments. */
export function buildEmailFlightRows(
  f: Row,
  fmtDate: (d?: string) => string,
): string {
  const td = 'padding:10px 12px;color:#1e293b;'
  const tr = (route: string, date: string, airline: string, cls: string) =>
    `<tr style="border-bottom:1px solid #f1f5f9;"><td style="${td}">${route}</td><td style="${td}">${date}</td><td style="${td}">${airline}</td><td style="${td}">${cls}</td></tr>`
  if (!isUnifiedFlight(f)) {
    const l = f as { from?: string; to?: string; airline?: string; date?: string; flightNumber?: string; class?: string }
    return tr(`${l.from || ''} → ${l.to || ''}`, l.date ? fmtDate(l.date) : '', `${l.airline || ''} ${l.flightNumber || ''}`, l.class || '')
  }
  const cls = escHtml(f.class ?? '')
  return buildProposalJourneys(f.journeys).map((j) =>
    `<tr style="background:#f8fafc;"><td colspan="4" style="padding:6px 12px;color:#C9A84C;font-size:11px;font-weight:700;">${escHtml(j.label)}${j.stops ? ` · ${j.stops} stop${j.stops > 1 ? 's' : ''}` : ' · Direct'}</td></tr>` +
    j.segments.map((sg) =>
      tr(`${escHtml(sg.from)} → ${escHtml(sg.to)}`, sg.date ? fmtDate(sg.date) : '', `${escHtml(sg.airline)} ${escHtml(sg.flightNumber)}${sg.departureTime ? ` · ${escHtml(sg.departureTime)}${sg.arrivalTime ? '–' + escHtml(sg.arrivalTime) : ''}` : ''}`, escHtml(sg.cabin ?? cls))
    ).join('')
  ).join('')
}

/** Voucher flight item: legacy fields unchanged; unified adds all journeys (no price, no supplier data). */
export function buildVoucherFlightExtras(f: Row): { routeLabel?: string; journeys?: ProposalJourney[] } {
  if (!isUnifiedFlight(f)) return {}
  return { routeLabel: flightRouteLabel(f), journeys: buildProposalJourneys(f.journeys) }
}
