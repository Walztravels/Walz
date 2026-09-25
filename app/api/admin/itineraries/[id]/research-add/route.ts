// POST /api/admin/itineraries/[id]/research-add
// Adds a Research result (Duffel flight offer or Hotelbeds rate) to an
// itinerary. PERSIST ONLY — never books with a supplier. The browser supplies
// identifiers only; every price/segment/room/cancellation detail is re-fetched
// from the supplier here.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { getOffer } from '@/lib/flights/duffel'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import { findRowWithOffer } from '@/lib/itinerary/unified-booking'
import {
  buildResearchHotelBooking,
  buildUnifiedFlightFromDuffelOffer,
  duffelOfferTotals,
  extractCheckedRate,
  priceSupplierAmount,
} from '@/lib/itinerary/research-add'

export const dynamic = 'force-dynamic'

const MAX_ATTEMPTS = 4
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** null/''/'[]' → []; malformed or non-array → null (caller must refuse, never overwrite). */
function parseColumn(json: string | null | undefined): Record<string, unknown>[] | null {
  if (json == null || json.trim() === '') return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}
const safeParse = (json: string | null | undefined) => parseColumn(json) ?? []

const INVALID_DATA = () =>
  err(422, 'This itinerary\'s bookings data is malformed. Fix it before adding new bookings; nothing was changed.', { code: 'ITINERARY_DATA_INVALID' })

/** HTTP status embedded by our supplier clients ('Duffel 404: …', 'Hotelbeds … → 400: …'). */
function supplierStatus(msg: string): number | null {
  const m = msg.match(/^Duffel (\d{3}):/) ?? msg.match(/→ (\d{3}):/)
  return m ? parseInt(m[1], 10) : null
}

const str = (v: unknown, max = 300): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

const posInt = (v: unknown, fallback: number, max = 20): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback
}

function err(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Unauthorized')
  // Itinerary Planner is gated by the 'bookings' section permission (sidebar).
  if (!hasPermission(session, 'bookings')) return err(403, 'Forbidden')

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return err(400, 'Invalid JSON body')
  }
  const type = body.type
  if (type !== 'flight' && type !== 'hotel') return err(400, "type must be 'flight' or 'hotel'")
  const allowDuplicate = body.allowDuplicate === true

  const itin = await prisma.itinerary.findUnique({ where: { id }, select: { id: true, currency: true } })
  if (!itin) return err(404, 'Itinerary not found')
  const itineraryCurrency = itin.currency || 'GBP'

  // ── Build the booking from SUPPLIER data only ────────────────────────────
  let booking: Record<string, unknown>
  let dedupeProvider: 'duffel' | 'hotelbeds'
  let dedupeOfferId: string
  let column: 'flights' | 'hotels'
  let auditRef: string

  if (type === 'flight') {
    const offerId = str(body.offerId, 200)
    if (!offerId || !/^[A-Za-z0-9_\-]+$/.test(offerId)) return err(400, 'offerId is required')

    // Cheap duplicate pre-check before spending a supplier call.
    if (!allowDuplicate) {
      const cur = await prisma.itinerary.findUnique({ where: { id }, select: { flights: true } })
      const rows0 = parseColumn(cur?.flights)
      if (!rows0) return INVALID_DATA()
      const dup = findRowWithOffer(rows0, 'duffel', offerId)
      if (dup) return NextResponse.json({ ok: false, duplicate: true, existingId: dup.id, error: 'This flight offer is already on the itinerary.' }, { status: 409 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let offer: any
    try {
      offer = await getOffer(offerId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const st = supplierStatus(msg)
      if (st === 404 || st === 410 || st === 422) {
        return err(410, 'This flight offer has expired or is no longer available. Please search again.', { code: 'OFFER_EXPIRED' })
      }
      console.error('[research-add] duffel getOffer failed', msg.slice(0, 200))
      return err(502, 'Could not re-verify this flight with the supplier. Please try again.')
    }
    if (!offer || !Array.isArray(offer.slices) || offer.slices.length === 0) {
      return err(410, 'This flight offer is no longer available. Please search again.', { code: 'OFFER_EXPIRED' })
    }
    if (offer.expires_at && new Date(offer.expires_at).getTime() <= Date.now()) {
      return err(410, 'This flight offer has expired. Please search again.', { code: 'OFFER_EXPIRED' })
    }

    const totals = duffelOfferTotals(offer)
    const priced = await priceSupplierAmount({
      productType: 'FLIGHT', supplier: 'DUFFEL',
      supplierAmount: totals.total, supplierCurrency: totals.currency,
      itineraryCurrency, taxes: totals.taxes, traceId: `itin:${id}`,
    })
    if (!priced.ok) return err(priced.status, priced.error, { code: priced.code })

    booking = buildUnifiedFlightFromDuffelOffer(offer, {
      pricing: priced.pricing, supplierTotal: totals.total, supplierCurrency: totals.currency.toUpperCase(),
    }) as unknown as Record<string, unknown>
    dedupeProvider = 'duffel'
    dedupeOfferId = String(offer.id ?? offerId)
    column = 'flights'
    auditRef = dedupeOfferId
  } else {
    const hotelCode = str(body.hotelCode, 60)
    const rateKey = str(body.rateKey, 4000)
    const checkIn = str(body.checkIn, 10)
    const checkOut = str(body.checkOut, 10)
    if (!hotelCode || !rateKey) return err(400, 'hotelCode and rateKey are required')
    if (!checkIn || !checkOut || !DATE_RE.test(checkIn) || !DATE_RE.test(checkOut)) return err(400, 'checkIn and checkOut (YYYY-MM-DD) are required')
    const nights = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
    if (!(nights >= 1)) return err(400, 'checkOut must be after checkIn')
    const rooms = Math.max(1, posInt(body.rooms, 1))
    const adults = Math.max(1, posInt(body.adults, 2))
    const children = posInt(body.children, 0)
    const childAges = Array.isArray(body.childAges)
      ? (body.childAges as unknown[]).map((a) => posInt(a, 0, 17)).slice(0, 20)
      : undefined

    if (!allowDuplicate) {
      const cur = await prisma.itinerary.findUnique({ where: { id }, select: { hotels: true } })
      const rows0 = parseColumn(cur?.hotels)
      if (!rows0) return INVALID_DATA()
      const dup = findRowWithOffer(rows0, 'hotelbeds', `${hotelCode}:${rateKey}`)
      if (dup) return NextResponse.json({ ok: false, duplicate: true, existingId: dup.id, error: 'This hotel rate is already on the itinerary.' }, { status: 409 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any
    try {
      data = await hotelbedsRequest('hotel', '/checkrates', { method: 'POST', body: { rooms: [{ rateKey }] } })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const st = supplierStatus(msg)
      if (st != null && st >= 400 && st < 500 && (st === 400 || st === 404 || st === 410 || st === 422)) {
        return err(410, 'This hotel rate is no longer available. Please search again.', { code: 'RATE_UNAVAILABLE' })
      }
      console.error('[research-add] hotelbeds checkrates failed', msg.slice(0, 200))
      return err(502, 'Could not re-verify this hotel rate with the supplier. Please try again.')
    }
    const rate = extractCheckedRate(data, rateKey)
    if (!rate) return err(410, 'This hotel rate is no longer available. Please search again.', { code: 'RATE_UNAVAILABLE' })
    if (rate.hotelCode && rate.hotelCode !== hotelCode) return err(400, 'Rate does not belong to the given hotel.')
    if (!rate.currency) return err(502, 'The supplier returned no currency for this rate.')

    const priced = await priceSupplierAmount({
      productType: 'HOTEL', supplier: 'HOTELBEDS',
      supplierAmount: rate.net, supplierCurrency: rate.currency,
      itineraryCurrency, traceId: `itin:${id}`,
    })
    if (!priced.ok) return err(priced.status, priced.error, { code: priced.code })

    const stars = Number(body.stars)
    booking = buildResearchHotelBooking({
      hotelCode,
      rate,
      pricing: priced.pricing,
      name: rate.hotelName ?? str(body.hotelName, 200) ?? 'Hotel',
      location: str(body.location, 200),
      stars: Number.isFinite(stars) && stars >= 0 && stars <= 5 ? stars : null,
      image: str(body.image, 1000),
      checkIn: rate.checkIn && DATE_RE.test(rate.checkIn) ? rate.checkIn : checkIn,
      checkOut: rate.checkOut && DATE_RE.test(rate.checkOut) ? rate.checkOut : checkOut,
      nights,
      occupancy: { rooms, adults, children, ...(childAges ? { childAges } : {}) },
    }) as unknown as Record<string, unknown>
    dedupeProvider = 'hotelbeds'
    dedupeOfferId = `${hotelCode}:${rateKey}`
    column = 'hotels'
    auditRef = hotelCode
  }

  // ── Persist: compare-and-swap on the JSON column, re-read on conflict ────
  // Two quick adds can't clobber each other (the second re-reads the row the
  // first wrote, re-checks duplicates, and appends to that).
  let flights: Record<string, unknown>[] = []
  let hotels: Record<string, unknown>[] = []
  let written = false
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !written; attempt++) {
    const cur = await prisma.itinerary.findUnique({ where: { id }, select: { flights: true, hotels: true } })
    if (!cur) return err(404, 'Itinerary not found')
    const rawJson = column === 'flights' ? cur.flights : cur.hotels
    const currentJson = rawJson ?? '[]'
    const rows = parseColumn(currentJson)
    if (!rows) return INVALID_DATA()

    if (!allowDuplicate) {
      const dup = findRowWithOffer(rows, dedupeProvider, dedupeOfferId)
      if (dup) {
        return NextResponse.json({ ok: false, duplicate: true, existingId: dup.id, error: 'This option is already on the itinerary.' }, { status: 409 })
      }
    }

    const next = [...rows, booking]
    const res = await prisma.itinerary.updateMany({
      // column is NOT NULL in the schema; a null (theoretical) has no CAS value
      where: rawJson == null ? { id } : { id, [column]: rawJson },
      data: { [column]: JSON.stringify(next), updatedAt: new Date() },
    })
    if (res.count === 1) {
      written = true
      flights = column === 'flights' ? next : safeParse(cur.flights)
      hotels = column === 'hotels' ? next : safeParse(cur.hotels)
    }
  }
  if (!written) return err(409, 'The itinerary was changed by someone else. Please retry.', { code: 'CONFLICT' })

  await prisma.activityLog.create({
    data: {
      staffId: session.id,
      staffName: session.name ?? session.email,
      staffRole: session.staffRole,
      action: 'ITINERARY_RESEARCH_ADD',
      module: 'itineraries',
      entityType: 'Itinerary',
      entityId: id,
      detail: `${type} added from research (${auditRef})`,
    },
  }).catch((e: unknown) => console.error('[research-add] audit write failed:', e instanceof Error ? e.message : e))

  // Same fire-and-forget normalised-table sync the PATCH route triggers.
  fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'}/api/admin/itineraries/${id}/sync`, {
    method: 'POST',
    headers: { Cookie: req.headers.get('cookie') ?? '' },
  }).catch(() => {})

  return NextResponse.json({ ok: true, kind: type, booking, flights, hotels })
}
