// lib/jade/trip-refinement-tools.ts
// Release 4C-A — Trip refinement: replace_trip_item, update_trip_preferences,
//                get_trip_commercial_summary
// Release 4C-C — Proposal creation: create_trip_proposal
//
// SECURITY invariants (identical to trip-tools.ts):
//   - Ownership validated before every read or write
//   - Protected items (CONFIRMED / PAYMENT_RECEIVED / CONFIRMING / RECONCILIATION_REQUIRED)
//     cannot be replaced or deleted
//   - Supplier payload, rateKey, net rates, gross margin NEVER returned to Jade
//   - Jade may NOT: pay, charge, refund, create or cancel supplier bookings
//   - CommercialEvents are server-authoritative (never from Jade input)

import { createHash, randomBytes } from 'crypto'
import prisma                      from '@/lib/db'
import {
  getTripItemFulfillmentStatus,
}                                  from '@/lib/trips/fulfillment'
import { resolveSearchRef }        from './search-ref'
import type { JadeTripToolContext } from './trip-tools'

// ── Protected fulfillment statuses ────────────────────────────────────────────

const PROTECTED_STATUSES = new Set([
  'CONFIRMED',
  'PAYMENT_RECEIVED',
  'CONFIRMING',
  'RECONCILIATION_REQUIRED',
])

// ── Tool schemas ───────────────────────────────────────────────────────────────

export const JADE_REFINEMENT_TOOL_SCHEMAS = [
  {
    name:        'replace_trip_item',
    description: "Replace an existing unconfirmed trip item with a new search result. The customer must have explicitly chosen the replacement. The old item must not be purchased or confirmed — call get_trip first to verify. The result_ref must come from a prior search tool call.",
    input_schema: {
      type: 'object',
      properties: {
        trip_id:     { type: 'string', description: 'The trip ID' },
        old_item_id: { type: 'string', description: 'ID of the item to replace (from get_trip)' },
        result_ref:  { type: 'string', description: 'The opaque resultRef (jr_...) from a search tool for the replacement' },
        notes:       { type: 'string', description: 'Optional customer-facing note for the new item' },
      },
      required: ['trip_id', 'old_item_id', 'result_ref'],
    },
  },
  {
    name:        'update_trip_preferences',
    description: "Update trip-level preferences: traveller count, budget, cabin class, hotel star preference, direct flights preference, and dates. When dates or traveller count change, unconfirmed items are marked stale — Jade should prompt the customer to re-search those components.",
    input_schema: {
      type: 'object',
      properties: {
        trip_id:        { type: 'string' },
        adults:         { type: 'integer', description: 'Number of adult travellers' },
        children:       { type: 'integer', description: 'Number of child travellers' },
        infants:        { type: 'integer', description: 'Number of infant travellers' },
        budget:         { type: 'number',  description: 'Total trip budget in the trip currency' },
        cabin_class:    { type: 'string',  enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'], description: 'Preferred flight cabin class' },
        direct_flights: { type: 'boolean', description: 'Customer prefers direct flights only' },
        hotel_stars:    { type: 'integer', minimum: 1, maximum: 5, description: 'Minimum hotel star rating' },
        start_date:     { type: 'string',  description: 'YYYY-MM-DD' },
        end_date:       { type: 'string',  description: 'YYYY-MM-DD' },
      },
      required: ['trip_id'],
    },
  },
  {
    name:        'get_trip_commercial_summary',
    description: "Get a financial summary of the current trip: totals by currency, item count, budget vs actual, missing key categories (FLIGHT, HOTEL). Use before suggesting budget refinements or creating a proposal.",
    input_schema: {
      type: 'object',
      properties: {
        trip_id: { type: 'string' },
      },
      required: ['trip_id'],
    },
  },
  {
    name:        'create_trip_proposal',
    description: "Create a DRAFT proposal from the current trip. Call only when the customer explicitly asks for a quote or proposal. The proposal is created in DRAFT status — staff review and price it before sending. Never call this without explicit customer request.",
    input_schema: {
      type: 'object',
      properties: {
        trip_id:         { type: 'string', description: 'The trip to create a proposal from' },
        customer_intent: { type: 'string', description: '1-2 sentence summary of what the customer is looking for' },
        customer_note:   { type: 'string', description: 'Optional verbatim note from the customer (e.g. "please include airport transfers")' },
      },
      required: ['trip_id'],
    },
  },
]

// ── Ownership helper (mirrors trip-tools.ts) ──────────────────────────────────

async function validateTripOwnership(
  tripId: string,
  ctx:    JadeTripToolContext,
): Promise<boolean> {
  if (!ctx.userId && !ctx.sessionId) return false
  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: { userId: true, sessionId: true },
  })
  if (!trip) return false
  if (ctx.userId    && trip.userId    === ctx.userId)    return true
  if (!ctx.userId   && ctx.sessionId  && trip.sessionId === ctx.sessionId) return true
  return false
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeJadeRefinementTool(
  name:  string,
  input: Record<string, unknown>,
  ctx:   JadeTripToolContext,
): Promise<string> {
  try {
    switch (name) {
      case 'replace_trip_item':          return await replaceTripItem(input, ctx)
      case 'update_trip_preferences':    return await updateTripPreferences(input, ctx)
      case 'get_trip_commercial_summary':return await getTripCommercialSummary(input, ctx)
      case 'create_trip_proposal':       return await createTripProposal(input, ctx)
      default: return JSON.stringify({ error: `Unknown refinement tool: ${name}` })
    }
  } catch (err) {
    console.error(`[jade-refinement-tools] ${name} failed:`, err)
    return JSON.stringify({ error: 'An error occurred — please try again.' })
  }
}

// ── replace_trip_item ─────────────────────────────────────────────────────────

async function replaceTripItem(
  input: Record<string, unknown>,
  ctx:   JadeTripToolContext,
): Promise<string> {
  const tripId    = typeof input.trip_id     === 'string' ? input.trip_id.trim()     : null
  const oldItemId = typeof input.old_item_id === 'string' ? input.old_item_id.trim() : null
  const resultRef = typeof input.result_ref  === 'string' ? input.result_ref.trim()  : null
  const notes     = typeof input.notes       === 'string' ? input.notes              : undefined

  if (!tripId)    return JSON.stringify({ error: 'trip_id is required' })
  if (!oldItemId) return JSON.stringify({ error: 'old_item_id is required' })
  if (!resultRef) return JSON.stringify({ error: 'result_ref is required' })

  const owned = await validateTripOwnership(tripId, ctx)
  if (!owned) return JSON.stringify({ error: 'Trip not found or access denied' })

  // Find the item to replace
  const oldItem = await prisma.tripItem.findUnique({
    where:  { id: oldItemId },
    select: { id: true, tripId: true, type: true, title: true, bookingRef: true, confirmed: true },
  })
  if (!oldItem || oldItem.tripId !== tripId) {
    return JSON.stringify({ error: 'Item not found in this trip' })
  }

  // Block if purchased / confirmed
  const fulfillmentStatus = await getTripItemFulfillmentStatus(
    { bookingRef: oldItem.bookingRef, confirmed: oldItem.confirmed, type: oldItem.type },
    { tripId },
  )
  if (PROTECTED_STATUSES.has(fulfillmentStatus)) {
    return JSON.stringify({
      error: 'protected',
      fulfillmentStatus,
      message: `"${oldItem.title}" cannot be replaced — it is ${fulfillmentStatus}. Please contact the Walz team via WhatsApp or email to modify this booking.`,
    })
  }

  // Resolve the replacement ref
  const resolved = await resolveSearchRef(resultRef, ctx)
  if (!resolved.ok) {
    switch (resolved.reason) {
      case 'SEARCH_RESULT_EXPIRED':
        return JSON.stringify({ error: 'SEARCH_RESULT_EXPIRED', message: 'This search result has expired. Please run a new search.' })
      case 'ACCESS_DENIED':
        return JSON.stringify({ error: 'ACCESS_DENIED', message: 'This result reference does not belong to this session.' })
      default:
        return JSON.stringify({ error: 'INVALID_RESULT_REFERENCE', message: 'The result reference is invalid. Please search again.' })
    }
  }

  const { ref } = resolved

  const itemTypeMap: Record<string, string> = {
    FLIGHT: 'FLIGHT', HOTEL: 'HOTEL', ACTIVITY: 'ACTIVITY', TRANSFER: 'TRANSFER', ESIM: 'ESIM',
  }
  const itemType = itemTypeMap[ref.productType]
  if (!itemType) return JSON.stringify({ error: `Unsupported product type: ${ref.productType}` })

  // Create new item first — if this fails, the old item is untouched
  const newItem = await prisma.tripItem.create({
    data: {
      tripId,
      type:      itemType as never,
      title:     ref.title,
      location:  (ref.details.destination as string | undefined) ??
                 (ref.details.zone        as string | undefined) ??
                 (ref.details.country     as string | undefined) ?? null,
      startTime: (ref.details.departure   as string | undefined) ??
                 (ref.details.checkIn     as string | undefined) ??
                 (ref.details.date        as string | undefined) ?? null,
      cost:      ref.sellingPrice,
      currency:  ref.currency,
      confirmed: false,
      ...(notes ? { notes } : {}),
      metadata:  ref.supplierPayload as never,
    },
    select: { id: true, type: true, title: true, location: true, startTime: true, cost: true, currency: true },
  })

  // Delete old item
  await prisma.tripItem.delete({ where: { id: oldItemId } })

  prisma.commercialEvent.create({
    data: {
      event:    'jade_trip_item_replaced',
      userId:   ctx.userId ?? null,
      metadata: {
        tripId, oldItemId, newItemId: newItem.id,
        productType: ref.productType, title: ref.title,
        sellingPrice: ref.sellingPrice, currency: ref.currency,
        source: 'jade_chat',
      },
    },
  }).catch(() => {})

  return JSON.stringify({
    ok:          true,
    newItemId:   newItem.id,
    oldItemId,
    tripId,
    productType: ref.productType,
    title:       ref.title,
    sellingPrice: ref.sellingPrice,
    currency:    ref.currency,
    location:    newItem.location,
    startTime:   newItem.startTime,
  })
}

// ── update_trip_preferences ───────────────────────────────────────────────────

async function updateTripPreferences(
  input: Record<string, unknown>,
  ctx:   JadeTripToolContext,
): Promise<string> {
  const tripId = typeof input.trip_id === 'string' ? input.trip_id.trim() : null
  if (!tripId) return JSON.stringify({ error: 'trip_id is required' })

  const owned = await validateTripOwnership(tripId, ctx)
  if (!owned) return JSON.stringify({ error: 'Trip not found or access denied' })

  const parseDate = (v: unknown): Date | null | undefined => {
    if (v === null || v === '') return null
    if (!v || typeof v !== 'string') return undefined
    const d = new Date(v)
    return isNaN(d.getTime()) ? undefined : d
  }

  const tripData: Record<string, unknown> = {}
  let datesChanged      = false
  let travellersChanged = false

  if (typeof input.adults   === 'number') { tripData.adults   = input.adults;   travellersChanged = true }
  if (typeof input.children === 'number') { tripData.children = input.children; travellersChanged = true }
  if (typeof input.infants  === 'number') { tripData.infants  = input.infants;  travellersChanged = true }
  if (typeof input.budget   === 'number') { tripData.budget   = input.budget }

  if (input.start_date !== undefined) {
    const d = parseDate(input.start_date)
    if (d !== undefined) { tripData.startDate = d; datesChanged = true }
  }
  if (input.end_date !== undefined) {
    const d = parseDate(input.end_date)
    if (d !== undefined) { tripData.endDate = d; datesChanged = true }
  }

  // cabin_class, direct_flights, hotel_stars: store in Trip.notes as JSON prefs
  // (no dedicated schema column in 4C-A — persisted as _jadePrefs in notes field)
  const newPrefs: Record<string, unknown> = {}
  if (input.cabin_class    !== undefined) newPrefs.cabinClass    = input.cabin_class
  if (input.direct_flights !== undefined) newPrefs.directFlights = input.direct_flights
  if (input.hotel_stars    !== undefined) newPrefs.hotelStars    = input.hotel_stars

  if (Object.keys(tripData).length === 0 && Object.keys(newPrefs).length === 0) {
    return JSON.stringify({ error: 'No fields to update' })
  }

  if (Object.keys(newPrefs).length > 0) {
    const existing = await prisma.trip.findUnique({
      where:  { id: tripId },
      select: { notes: true },
    })
    let stored: Record<string, unknown> = {}
    if (existing?.notes) {
      try { stored = JSON.parse(existing.notes) } catch { /* plain text notes — ignore */ }
    }
    tripData.notes = JSON.stringify({ ...stored, _jadePrefs: { ...(stored._jadePrefs as object | undefined ?? {}), ...newPrefs } })
  }

  if (Object.keys(tripData).length > 0) {
    await prisma.trip.update({ where: { id: tripId }, data: tripData })
  }

  // Mark unconfirmed items stale
  let staleReason: string | null = null
  if (datesChanged) {
    staleReason = 'dates_changed'
    const staleJson = JSON.stringify({ staleReason: 'dates_changed', staleAt: new Date().toISOString() })
    await prisma.$executeRaw`
      UPDATE "TripItem"
      SET metadata = metadata || ${staleJson}::jsonb
      WHERE "tripId" = ${tripId} AND confirmed = false
    `
  } else if (travellersChanged) {
    staleReason = 'travellers_changed'
    const staleJson = JSON.stringify({ staleReason: 'travellers_changed', staleAt: new Date().toISOString() })
    await prisma.$executeRaw`
      UPDATE "TripItem"
      SET metadata = metadata || ${staleJson}::jsonb
      WHERE "tripId" = ${tripId} AND confirmed = false
    `
  }

  prisma.commercialEvent.create({
    data: {
      event:    'jade_trip_refined',
      userId:   ctx.userId ?? null,
      metadata: { tripId, fields: [...Object.keys(tripData), ...Object.keys(newPrefs)], staleReason, source: 'jade_chat' },
    },
  }).catch(() => {})

  return JSON.stringify({
    ok:               true,
    tripId,
    updated:          [...Object.keys(tripData), ...Object.keys(newPrefs)],
    staleReason,
    itemsInvalidated: staleReason !== null,
    message: staleReason === 'dates_changed'
      ? 'Trip dates updated. Your unconfirmed items (flights, hotels, etc.) are now stale — please re-search for the new dates.'
      : staleReason === 'travellers_changed'
      ? 'Traveller count updated. Your unconfirmed items may no longer be valid for the new party size — please re-search.'
      : 'Trip preferences updated.',
  })
}

// ── get_trip_commercial_summary ───────────────────────────────────────────────

async function getTripCommercialSummary(
  input: Record<string, unknown>,
  ctx:   JadeTripToolContext,
): Promise<string> {
  const tripId = typeof input.trip_id === 'string' ? input.trip_id.trim() : null
  if (!tripId) return JSON.stringify({ error: 'trip_id is required' })

  const owned = await validateTripOwnership(tripId, ctx)
  if (!owned) return JSON.stringify({ error: 'Trip not found or access denied' })

  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: {
      currency:    true,
      budget:      true,
      destination: true,
      items: {
        select: { type: true, cost: true, currency: true, confirmed: true },
      },
    },
  })
  if (!trip) return JSON.stringify({ error: 'Trip not found' })

  // Sum costs per currency — NEVER mix currencies
  const totalsByCurrency: Record<string, number> = {}
  for (const item of trip.items) {
    if (item.cost == null) continue
    const cur = item.currency || trip.currency
    totalsByCurrency[cur] = (totalsByCurrency[cur] ?? 0) + item.cost
  }
  for (const cur of Object.keys(totalsByCurrency)) {
    totalsByCurrency[cur] = Math.round(totalsByCurrency[cur] * 100) / 100
  }

  const itemTypes         = new Set<string>(trip.items.map(i => String(i.type)))
  const missingCategories = ['FLIGHT', 'HOTEL'].filter(c => !itemTypes.has(c))

  const tripTotal  = totalsByCurrency[trip.currency] ?? 0
  const budget     = trip.budget ?? null
  const overBudget = budget != null ? tripTotal > budget : null
  const remaining  = budget != null ? Math.round((budget - tripTotal) * 100) / 100 : null

  return JSON.stringify({
    tripId,
    itemCount:            trip.items.length,
    totalsByCurrency,
    tripCurrency:         trip.currency,
    budget,
    remainingBudget:      remaining,
    overBudget,
    missingCategories,
    confirmedItemCount:   trip.items.filter(i => i.confirmed).length,
    unconfirmedItemCount: trip.items.filter(i => !i.confirmed).length,
  })
}

// ── create_trip_proposal ──────────────────────────────────────────────────────
// Creates a Quote in DRAFT status linked to the Trip and, if found, the Lead.
// Jade never determines or modifies pricing — server uses TripItem.cost values
// which were set server-authoritative at search time.
// SECURITY: no supplier payload, rateKey, or net amounts in the Quote.

async function createTripProposal(
  input: Record<string, unknown>,
  ctx:   JadeTripToolContext,
): Promise<string> {
  const tripId         = typeof input.trip_id         === 'string' ? input.trip_id.trim()         : null
  const customerIntent = typeof input.customer_intent === 'string' ? input.customer_intent.trim() : null
  const customerNote   = typeof input.customer_note   === 'string' ? input.customer_note.trim()   : null

  if (!tripId)     return JSON.stringify({ error: 'trip_id is required' })
  if (!ctx.userId) return JSON.stringify({ error: 'Must be signed in to create a proposal.' })

  const owned = await validateTripOwnership(tripId, ctx)
  if (!owned) return JSON.stringify({ error: 'Trip not found or access denied' })

  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: {
      title:       true,
      destination: true,
      currency:    true,
      leadId:      true,
      items: {
        select: {
          id:          true,
          type:        true,
          title:       true,
          description: true,
          cost:        true,
          currency:    true,
          startTime:   true,
          location:    true,
        },
      },
    },
  })
  if (!trip)                  return JSON.stringify({ error: 'Trip not found' })
  if (!trip.items.length)     return JSON.stringify({ error: 'Cannot create a proposal for an empty trip. Add some items first.' })

  const user = await prisma.user.findUnique({
    where:  { id: ctx.userId },
    select: { name: true, email: true },
  })
  if (!user?.email) return JSON.stringify({ error: 'User account email not found.' })

  // Find associated lead — trip.leadId first, then by email
  let leadId = trip.leadId ?? null
  if (!leadId) {
    const lead = await prisma.lead.findFirst({
      where:  { email: user.email },
      select: { id: true },
    })
    leadId = lead?.id ?? null
  }

  // Only include items in the trip currency — never mix currencies in a Quote
  const tripCurrency  = trip.currency
  const eligibleItems = trip.items.filter(i => i.currency === tripCurrency && i.cost != null)
  const skippedCount  = trip.items.length - eligibleItems.length
  const subtotalCents = eligibleItems.reduce((s, i) => s + Math.round((i.cost ?? 0) * 100), 0)

  // Generate opaque reference and secure token
  const rawToken        = randomBytes(32).toString('hex')
  const secureTokenHash = createHash('sha256').update(rawToken).digest('hex')
  const reference       = `JADE-${randomBytes(3).toString('hex').toUpperCase()}`

  const propTitle = trip.title || `${trip.destination || 'Your'} Travel Proposal`
  const descParts = [
    customerIntent || `Travel proposal for ${trip.destination || 'your trip'}`,
    customerNote   ? `\n\nCustomer note: ${customerNote}` : '',
    skippedCount   ? `\n\n(${skippedCount} item(s) in other currencies were excluded from the total.)` : '',
  ].filter(Boolean)

  const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days

  const quote = await prisma.quote.create({
    data: {
      reference,
      secureTokenHash,
      clientName:         user.name ?? 'Customer',
      clientEmail:        user.email,
      currency:           tripCurrency,
      title:              propTitle,
      description:        descParts.join(''),
      status:             'draft',
      validUntil,
      createdBy:          'jade@walztravels.com',
      subtotalMinor:      BigInt(subtotalCents),
      totalMinor:         BigInt(subtotalCents),
      markupMinor:        BigInt(0),
      serviceChargeMinor: BigInt(0),
      discountMinor:      BigInt(0),
      leadId:             leadId ?? undefined,
      tripId,
      items: {
        create: eligibleItems.map((item, idx) => ({
          type:              item.type as never,
          title:             item.title,
          description:       item.description ?? null,
          sortOrder:         idx,
          sourceType:        'jade',
          costMinor:         BigInt(Math.round((item.cost ?? 0) * 100)),
          markupMinor:       BigInt(0),
          serviceFeeMinor:   BigInt(0),
          sellingPriceMinor: BigInt(Math.round((item.cost ?? 0) * 100)),
          currency:          tripCurrency,
          clientVisible:     true,
          showPriceToClient: true,
          metadata:          {
            startTime:   item.startTime  ?? null,
            location:    item.location   ?? null,
            tripItemId:  item.id,
          },
        })),
      },
    },
    select: { id: true, reference: true },
  })

  prisma.commercialEvent.create({
    data: {
      event:    'jade_proposal_created',
      userId:   ctx.userId,
      leadId:   leadId ?? undefined,
      metadata: {
        tripId, quoteId: quote.id, reference: quote.reference,
        itemCount: eligibleItems.length, currency: tripCurrency,
        totalMinor: subtotalCents, source: 'jade_chat',
      },
    },
  }).catch(() => {})

  return JSON.stringify({
    ok:                true,
    proposalReference: quote.reference,
    itemCount:         eligibleItems.length,
    currency:          tripCurrency,
    message: `Your proposal has been created (ref: ${quote.reference}) and is in DRAFT — our team will review, price, and send it to you within 24 hours.`,
    ...(skippedCount ? { note: `${skippedCount} item(s) in other currencies were not included.` } : {}),
  })
}
