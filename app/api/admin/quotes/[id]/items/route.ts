import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { updateQuoteTotals } from '@/lib/quotes/update-totals'

/**
 * QUOTE BUILDER V1.4 — Agent C (Manual Flight Entry).
 *
 * POST /api/admin/quotes/[id]/items — create a NEW manual line item on an
 * EXISTING quote, server-side, immediately (not deferred to quote-creation
 * time). This route did not exist before this pass.
 *
 * WHY THIS ROUTE EXISTS (persistence-path audit finding): before this pass,
 * every manual line item (useQuoteBuilderState.ts's `items`/`addItem`) lived
 * ONLY in local draft state and was persisted exactly once, as a flat
 * `QuoteItem` with no linked option row, inside POST /api/admin/quotes'
 * `items` array — see that route's `tx.quoteItem.createMany` block. That
 * flow is fine for a flat-priced item (visa/walz_service/custom) but cannot
 * represent a structured flight (airline, per-journey segments, cabin,
 * baggage) — and critically, feeding N manually-entered journeys through it
 * naively would mean N separate `QuoteItem` rows for one trip (the exact
 * regression this feature exists to prevent), or would require touching
 * app/api/admin/quotes/route.ts, which is outside this agent's file
 * ownership for this pass.
 *
 * Instead this route mirrors the EXISTING dual-write pattern
 * app/api/admin/travel-search/add-to-quote/route.ts already uses for a
 * live-search flight attach (one `QuoteFlightOption` + N
 * `QuoteFlightSegment` rows + one linked `QuoteItem` row, then
 * `updateQuoteTotals`) — same shape, same permission (`quotes.create`, the
 * ADD action), same conversationId identity re-check, same
 * converted/archived/cancelled draft gate — but for a MANUAL entry with NO
 * supplier offer (`duffelOfferId: null`) and therefore NO revalidation step:
 * a manual entry has no live supplier price to re-check against, so the
 * staff-entered cost/selling price are trusted directly (server-side input
 * validation still applies — see below — this is a different guarantee than
 * "we verified this price against a supplier", not a weaker one for what it
 * actually claims).
 *
 * Scope: this route currently only supports `type: 'flight'` /
 * `sourceType: 'manual'` — the one path this pass was asked to build. A
 * manual-flight item created via this route is a SEPARATE mechanism from
 * the flat items[] array a whole quote is created with in
 * app/api/admin/quotes/route.ts's POST — it always requires an existing
 * quote id (the client ensures one exists first, exactly as
 * confirmAddPending already does for live-search attaches, via
 * handleCreate({ allowEmptyItems: true })).
 */

const MANUAL_FLIGHT_CABINS = ['economy', 'premium_economy', 'business', 'first'] as const
type ManualFlightCabin = typeof MANUAL_FLIGHT_CABINS[number]
const CABIN_TO_DB: Record<ManualFlightCabin, string> = {
  economy: 'ECONOMY', premium_economy: 'PREMIUM_ECONOMY', business: 'BUSINESS', first: 'FIRST',
}

const TRIP_TYPES = ['one-way', 'round-trip', 'multi-city'] as const
type ManualTripType = typeof TRIP_TYPES[number]

// Mirrors useQuoteBuilderState.ts's MC_MAX_LEGS (the live-search multi-city
// cap) — not imported directly since that file is a 'use client' React hook
// module, not a plain server-safe constants module; kept in sync by
// convention/comment instead.
const MAX_MANUAL_FLIGHT_LEGS = 5

interface ManualFlightSegmentInput {
  originCode: unknown
  originCity?: unknown
  destinationCode: unknown
  destinationCity?: unknown
  departureAt: unknown
  arrivalAt: unknown
  flightNumber?: unknown
  stops?: unknown
}

interface ManualFlightItemBody {
  type: unknown
  sourceType?: unknown
  tripType: unknown
  airline: unknown
  airlineCode?: unknown
  cabinClass: unknown
  fareClass?: unknown
  baggage?: unknown
  costMinor: unknown
  sellingPriceMinor: unknown
  currency: unknown
  label?: unknown
  notes?: unknown
  segments: unknown
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}
function isPositiveIntMinor(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v > 0
}
function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0
}
function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

interface ValidatedSegment {
  originCode: string; originCity: string | null
  destinationCode: string; destinationCity: string | null
  departureAt: Date; arrivalAt: Date
  flightNumber: string | null
  stops: number
}

/** Validates the whole body. Returns either the validated, typed payload or
 *  a 400 error message — never partially validates then coerces the rest. */
function validateManualFlightBody(body: unknown): { ok: true; value: {
  tripType: ManualTripType; airline: string; airlineCode: string | null
  cabinClass: ManualFlightCabin; fareClass: string | null; baggage: string | null
  costMinor: number; sellingPriceMinor: number; currency: string
  label: string | null; notes: string | null; segments: ValidatedSegment[]
} } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' }
  const b = body as ManualFlightItemBody

  if (b.type !== 'flight') {
    return { ok: false, error: 'Only type "flight" is supported by this endpoint.' }
  }
  if (b.sourceType !== undefined && b.sourceType !== 'manual') {
    return { ok: false, error: 'This endpoint only creates manually-entered items (sourceType "manual").' }
  }
  if (!isNonEmptyString(b.airline)) return { ok: false, error: 'Airline is required.' }
  if (!isNonEmptyString(b.cabinClass) || !MANUAL_FLIGHT_CABINS.includes(b.cabinClass as ManualFlightCabin)) {
    return { ok: false, error: 'A valid cabin class is required.' }
  }
  if (!isNonEmptyString(b.tripType) || !TRIP_TYPES.includes(b.tripType as ManualTripType)) {
    return { ok: false, error: 'A valid trip type is required.' }
  }
  if (!isNonEmptyString(b.currency)) return { ok: false, error: 'Currency is required.' }
  if (!isPositiveIntMinor(b.costMinor)) return { ok: false, error: 'Supplier cost must be a positive amount.' }
  if (!isPositiveIntMinor(b.sellingPriceMinor)) return { ok: false, error: 'Client selling price must be a positive amount.' }
  if (!Array.isArray(b.segments) || b.segments.length === 0) {
    return { ok: false, error: 'At least one flight journey is required.' }
  }
  if (b.segments.length > MAX_MANUAL_FLIGHT_LEGS) {
    return { ok: false, error: `A manual flight can have at most ${MAX_MANUAL_FLIGHT_LEGS} journeys.` }
  }
  const tripType = b.tripType as ManualTripType
  if (tripType === 'one-way' && b.segments.length !== 1) {
    return { ok: false, error: 'A one-way manual flight must have exactly one journey.' }
  }
  if (tripType === 'round-trip' && b.segments.length !== 2) {
    return { ok: false, error: 'A return manual flight must have exactly two journeys (outbound and return).' }
  }
  if (tripType === 'multi-city' && b.segments.length < 2) {
    return { ok: false, error: 'A multi-city manual flight needs at least two journeys.' }
  }

  const segments: ValidatedSegment[] = []
  for (let i = 0; i < b.segments.length; i++) {
    const raw = (b.segments as unknown[])[i] as ManualFlightSegmentInput
    if (!raw || typeof raw !== 'object') return { ok: false, error: `Journey ${i + 1}: invalid entry.` }
    if (!isNonEmptyString(raw.originCode)) return { ok: false, error: `Journey ${i + 1}: origin is required.` }
    if (!isNonEmptyString(raw.destinationCode)) return { ok: false, error: `Journey ${i + 1}: destination is required.` }
    const departureAt = parseDate(raw.departureAt)
    if (!departureAt) return { ok: false, error: `Journey ${i + 1}: a valid departure date/time is required.` }
    const arrivalAt = parseDate(raw.arrivalAt)
    if (!arrivalAt) return { ok: false, error: `Journey ${i + 1}: a valid arrival date/time is required.` }
    if (arrivalAt.getTime() <= departureAt.getTime()) {
      return { ok: false, error: `Journey ${i + 1}: arrival must be after departure.` }
    }
    let stops = 0
    if (raw.stops !== undefined && raw.stops !== null && raw.stops !== '') {
      if (!isNonNegativeInt(Number(raw.stops))) return { ok: false, error: `Journey ${i + 1}: stops must be a non-negative whole number.` }
      stops = Number(raw.stops)
    }
    segments.push({
      originCode: (raw.originCode as string).trim().toUpperCase(),
      originCity: isNonEmptyString(raw.originCity) ? raw.originCity.trim() : null,
      destinationCode: (raw.destinationCode as string).trim().toUpperCase(),
      destinationCity: isNonEmptyString(raw.destinationCity) ? raw.destinationCity.trim() : null,
      departureAt, arrivalAt,
      flightNumber: isNonEmptyString(raw.flightNumber) ? raw.flightNumber.trim() : null,
      stops,
    })
  }

  return {
    ok: true,
    value: {
      tripType,
      airline: (b.airline as string).trim(),
      airlineCode: isNonEmptyString(b.airlineCode) ? b.airlineCode.trim() : null,
      cabinClass: b.cabinClass as ManualFlightCabin,
      fareClass: isNonEmptyString(b.fareClass) ? b.fareClass.trim() : null,
      baggage: isNonEmptyString(b.baggage) ? b.baggage.trim() : null,
      costMinor: b.costMinor as number,
      sellingPriceMinor: b.sellingPriceMinor as number,
      currency: (b.currency as string).trim(),
      label: isNonEmptyString(b.label) ? b.label.trim() : null,
      notes: isNonEmptyString(b.notes) ? b.notes.trim() : null,
      segments,
    },
  }
}

function bigintToNumber(obj: unknown): unknown {
  if (typeof obj === 'bigint') return Number(obj)
  if (obj instanceof Date) return obj
  if (Array.isArray(obj)) return obj.map(bigintToNumber)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, bigintToNumber(v)]))
  }
  return obj
}

function routeLabel(tripType: ManualTripType, segments: ValidatedSegment[]): string {
  if (tripType === 'round-trip') return `${segments[0].originCode} ⇄ ${segments[0].destinationCode}`
  return `${segments[0].originCode} → ${segments[segments.length - 1].destinationCode}`
}

// POST /api/admin/quotes/[id]/items — add a manual flight item to an
// existing quote.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Same permission add-to-quote uses for its ADD action — this is the same
  // kind of action (attaching a new priced item to a quote), just for a
  // manually-entered flight instead of a live-search offer.
  if (!hasPermission(session, 'quotes.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const quote = await prisma.quote.findUnique({ where: { id: params.id } })
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  if (['converted', 'archived', 'cancelled'].includes(quote.status)) {
    return NextResponse.json({ error: 'Quote is not editable' }, { status: 409 })
  }

  // Same Inbox identity re-check every other commercial quote mutation
  // enforces (add-to-quote, items/[itemId]) — a quote with no
  // conversationId (built outside the Inbox) has no conversation to
  // resolve identity against, so this is skipped for it, matching those
  // routes' existing, correct scope.
  if (quote.conversationId != null) {
    const resolved = await resolveClientActionContext(quote.conversationId, session)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error, code: 'CLIENT_IDENTITY_REQUIRED' }, { status: resolved.status })
    }
    if (resolved.context.resolution !== 'VERIFIED' && resolved.context.resolution !== 'LINKED') {
      return NextResponse.json(
        { error: 'Verify the client identity before adding items to this quote.', code: 'CLIENT_IDENTITY_REQUIRED' },
        { status: 403 },
      )
    }
  }

  const body = await req.json().catch(() => null)
  const validated = validateManualFlightBody(body)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error, code: 'INVALID_INPUT' }, { status: 400 })
  }
  const v = validated.value

  // A manual item carries no supplier offer and therefore no live price to
  // re-verify against (unlike add-to-quote's flight/hotel branches, which
  // always re-fetch and re-check a supplier's current price before trusting
  // client-submitted figures) — staff-entered cost/selling price ARE the
  // record of truth here. What IS still enforced, same as everywhere else
  // in this codebase, is that a quote never silently sums cross-currency
  // amounts: a manual item's currency must match the quote's own currency.
  // (Live-search items get a genuine FX-conversion path because they carry
  // an independently-verified supplier amount to convert; a manual entry
  // has no such verified source amount, so rather than silently reprice a
  // staff-entered figure through an FX rate, mismatched currency is
  // rejected outright and the client is expected to default to — or the
  // staff to select — the quote's own currency, exactly as the Quote
  // Builder UI already does for its currency field.)
  if (v.currency.toUpperCase() !== quote.currency.toUpperCase()) {
    return NextResponse.json(
      { error: `This item's currency (${v.currency}) must match the quote's currency (${quote.currency}).`, code: 'CURRENCY_MISMATCH' },
      { status: 400 },
    )
  }

  const markupMinor = v.sellingPriceMinor - v.costMinor
  const title = v.label ?? `${v.airline} · ${routeLabel(v.tripType, v.segments)}`

  const flightOption = await prisma.quoteFlightOption.create({
    data: {
      quoteId: quote.id,
      label: v.label,
      isRecommended: false,
      airline: v.airline,
      airlineCode: v.airlineCode,
      tripType: v.tripType,
      cabinClass: CABIN_TO_DB[v.cabinClass],
      fareClass: v.fareClass,
      checkedBaggage: v.baggage,
      duffelOfferId: null,
      costMinor: BigInt(v.costMinor),
      markupMinor: BigInt(markupMinor),
      serviceFeeMinor: BigInt(0),
      sellingPriceMinor: BigInt(v.sellingPriceMinor),
      currency: quote.currency,
      sourceType: 'manual',
      internalNote: v.notes,
      segments: {
        create: v.segments.map((s, i) => ({
          segmentOrder: i,
          originCode: s.originCode,
          originCity: s.originCity,
          destinationCode: s.destinationCode,
          destinationCity: s.destinationCity,
          departureAt: s.departureAt,
          arrivalAt: s.arrivalAt,
          flightNumber: s.flightNumber,
          marketingCarrier: v.airlineCode,
          durationMinutes: Math.round((s.arrivalAt.getTime() - s.departureAt.getTime()) / 60000),
          stops: s.stops,
        })),
      },
    },
    include: { segments: true },
  })

  const item = await prisma.quoteItem.create({
    data: {
      quoteId: quote.id,
      type: 'flight',
      title,
      sourceType: 'manual',
      supplier: v.airline,
      supplierRef: null,
      costMinor: BigInt(v.costMinor),
      markupMinor: BigInt(markupMinor),
      serviceFeeMinor: BigInt(0),
      sellingPriceMinor: BigInt(v.sellingPriceMinor),
      currency: quote.currency,
      flightOptionId: flightOption.id,
      internalNote: v.notes,
    },
  })

  await updateQuoteTotals(quote.id)

  await prisma.quoteActivity.create({
    data: {
      quoteId: quote.id, actor: session.email, actorType: 'staff',
      eventType: 'item_added',
      detail: `Added manual flight item: ${title}`,
    },
  })

  return NextResponse.json({
    type: 'flight',
    flightOption: bigintToNumber(flightOption),
    item: bigintToNumber(item),
  })
}
