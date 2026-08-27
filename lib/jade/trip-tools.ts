// lib/jade/trip-tools.ts
// Release 4A — Jade Trip write tools
//
// Tool schemas + server-side executor with ownership validation,
// purchased-item protection, and server-authoritative CommercialEvents.
//
// SECURITY INVARIANTS:
//   - partnerNetPrice / supplierCost / rateKey / sourceId / metadata NEVER returned
//   - Ownership validated before any read or write
//   - Protected items (CONFIRMED/PAYMENT_RECEIVED/CONFIRMING/RECONCILIATION_REQUIRED) cannot be deleted
//   - Jade may NOT: pay, charge, refund, create supplier booking, cancel supplier booking
//   - CommercialEvents jade_trip_created/updated/item_added/item_removed are server-authoritative

import prisma from '@/lib/db'
import { getTripItemFulfillmentStatus } from '@/lib/trips/fulfillment'
import { resolveSearchRef }             from './search-ref'

// ── Context ───────────────────────────────────────────────────────────────────

export interface JadeTripToolContext {
  userId:    string | null   // authenticated NextAuth user ID
  sessionId: string | null   // anonymous session ID for unauthenticated customers
}

// ── Protected fulfillment statuses ────────────────────────────────────────────
// Items with these statuses cannot be deleted by Jade (spec 4A)

const PROTECTED_STATUSES = new Set([
  'CONFIRMED',
  'PAYMENT_RECEIVED',
  'CONFIRMING',
  'RECONCILIATION_REQUIRED',
])

// ── Tool schema type ──────────────────────────────────────────────────────────

export interface JadeToolSchema {
  name:         string
  description:  string
  input_schema: {
    type:       'object'
    properties: Record<string, unknown>
    required?:  string[]
  }
}

// ── Tool schemas ──────────────────────────────────────────────────────────────
// Sent to Claude API when JADE_TRIP_WRITE_ENABLED=true

export const JADE_TRIP_TOOL_SCHEMAS: JadeToolSchema[] = [
  {
    name:        'get_trip',
    description: "Read the customer's current trip including all items and their fulfillment status. Call this before suggesting any modifications to their trip.",
    input_schema: {
      type: 'object',
      properties: {
        trip_id: {
          type:        'string',
          description: 'The trip ID. The customer must provide this or it must be known from context.',
        },
      },
      required: ['trip_id'],
    },
  },
  {
    name:        'create_trip',
    description: "Create a new trip for the customer. Only call when the customer's intent to plan a trip is clear and you have at least a destination.",
    input_schema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Primary destination city or country' },
        origin:      { type: 'string', description: 'Departure city or airport' },
        adults:      { type: 'integer', description: 'Number of adult travellers', default: 1 },
        children:    { type: 'integer', description: 'Number of child travellers', default: 0 },
        infants:     { type: 'integer', description: 'Number of infant travellers', default: 0 },
        start_date:  { type: 'string', description: 'Departure date YYYY-MM-DD' },
        end_date:    { type: 'string', description: 'Return date YYYY-MM-DD' },
        currency:    { type: 'string', description: 'Trip currency e.g. GBP, NGN, USD', default: 'GBP' },
        title:       { type: 'string', description: 'Optional trip name e.g. "Dubai Family Holiday"' },
      },
      required: ['destination'],
    },
  },
  {
    name:        'update_trip',
    description: 'Update trip-level details (destination, dates, traveller count). Does not modify individual items.',
    input_schema: {
      type: 'object',
      properties: {
        trip_id:     { type: 'string' },
        destination: { type: 'string' },
        origin:      { type: 'string' },
        title:       { type: 'string' },
        currency:    { type: 'string' },
        adults:      { type: 'integer' },
        children:    { type: 'integer' },
        infants:     { type: 'integer' },
        start_date:  { type: 'string', description: 'YYYY-MM-DD' },
        end_date:    { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['trip_id'],
    },
  },
  {
    name:        'add_trip_item',
    description: "Add an item to the customer's trip. Only add items the customer has explicitly selected — never invent prices, availability, or supplier details.",
    input_schema: {
      type: 'object',
      properties: {
        trip_id:    { type: 'string' },
        type:       {
          type: 'string',
          enum: ['FLIGHT', 'HOTEL', 'ACTIVITY', 'TRANSFER', 'ESIM', 'TOUR', 'TRANSPORT', 'RESTAURANT', 'CUSTOM'],
          description: 'Item category',
        },
        title:      { type: 'string', description: 'Item name as shown to the customer' },
        location:   { type: 'string', description: 'City, hotel name, or activity venue' },
        start_time: { type: 'string', description: 'Start date or date-time (YYYY-MM-DD or YYYY-MM-DDTHH:mm)' },
        cost:       { type: 'number', description: 'Customer selling price — never supplier cost or net rate' },
        currency:   { type: 'string', description: 'Price currency (GBP, NGN, USD, AED…)' },
        notes:      { type: 'string', description: 'Optional customer-facing note (e.g. check-in info)' },
      },
      required: ['trip_id', 'type', 'title', 'currency'],
    },
  },
  {
    name:        'remove_trip_item',
    description: "Remove a wishlist item from the trip. Purchased or confirmed items cannot be removed — if protected, Jade explains this to the customer and directs them to the Walz team.",
    input_schema: {
      type: 'object',
      properties: {
        trip_id: { type: 'string' },
        item_id: { type: 'string', description: 'The item ID from get_trip' },
      },
      required: ['trip_id', 'item_id'],
    },
  },
  {
    name:        'add_search_result_to_trip',
    description: "Add a live search result to a trip using its opaque result ref. Call this ONLY after the customer has explicitly confirmed they want to add the item. The result ref was returned by search_flights, search_hotels, search_activities, search_transfers, or search_esims. Never invent a resultRef — it must come from a prior search tool call.",
    input_schema: {
      type: 'object',
      properties: {
        trip_id:    { type: 'string', description: 'The trip to add the item to. Create a trip first if needed.' },
        result_ref: { type: 'string', description: 'The opaque resultRef string returned by a search tool (starts with jr_)' },
        notes:      { type: 'string', description: 'Optional customer-facing note about this item' },
      },
      required: ['trip_id', 'result_ref'],
    },
  },
]

// ── Ownership validation ──────────────────────────────────────────────────────

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

  if (ctx.userId && trip.userId === ctx.userId) return true
  if (!ctx.userId && ctx.sessionId && trip.sessionId === ctx.sessionId) return true
  return false
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeJadeTripTool(
  name:  string,
  input: Record<string, unknown>,
  ctx:   JadeTripToolContext,
): Promise<string> {
  try {
    switch (name) {
      case 'get_trip':                  return await getTrip(input, ctx)
      case 'create_trip':               return await createTrip(input, ctx)
      case 'update_trip':               return await updateTrip(input, ctx)
      case 'add_trip_item':             return await addTripItem(input, ctx)
      case 'remove_trip_item':          return await removeTripItem(input, ctx)
      case 'add_search_result_to_trip': return await addSearchResultToTrip(input, ctx)
      default: return JSON.stringify({ error: `Unknown trip tool: ${name}` })
    }
  } catch (err) {
    console.error(`[jade-trip-tools] ${name} failed:`, err)
    return JSON.stringify({ error: 'An error occurred — please try again.' })
  }
}

// ── get_trip ──────────────────────────────────────────────────────────────────

async function getTrip(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  const tripId = input.trip_id as string | undefined
  if (!tripId) return JSON.stringify({ error: 'trip_id is required' })

  const owned = await validateTripOwnership(tripId, ctx)
  if (!owned) return JSON.stringify({ error: 'Trip not found or access denied' })

  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: {
      id: true, title: true, destination: true, origin: true, status: true,
      adults: true, children: true, infants: true, currency: true,
      startDate: true, endDate: true,
      items: {
        select: {
          id: true, type: true, title: true, location: true,
          startTime: true, cost: true, currency: true,
          confirmed: true, bookingRef: true,
          // sourceId intentionally excluded — may contain rateKey
          // metadata intentionally excluded — may contain rateKey
        },
        orderBy: [{ order: 'asc' }],
      },
    },
  })
  if (!trip) return JSON.stringify({ error: 'Trip not found' })

  // Resolve fulfillment status for each item — uses at most 3 DB queries total (batch helper)
  const itemsWithStatus = await Promise.all(
    trip.items.map(async i => {
      const fulfillmentStatus = await getTripItemFulfillmentStatus(
        { bookingRef: i.bookingRef, confirmed: i.confirmed, type: i.type },
        { tripId },
      )
      return {
        id:                i.id,
        type:              i.type,
        title:             i.title,
        location:          i.location,
        startTime:         i.startTime,
        cost:              i.cost,
        currency:          i.currency,
        confirmed:         i.confirmed,
        fulfillmentStatus,
      }
    }),
  )

  return JSON.stringify({
    id:          trip.id,
    title:       trip.title,
    destination: trip.destination || null,
    origin:      trip.origin      || null,
    adults:      trip.adults,
    children:    trip.children,
    infants:     trip.infants,
    status:      trip.status,
    currency:    trip.currency,
    startDate:   trip.startDate ? trip.startDate.toISOString().slice(0, 10) : null,
    endDate:     trip.endDate   ? trip.endDate.toISOString().slice(0, 10)   : null,
    itemCount:   trip.items.length,
    items:       itemsWithStatus,
  })
}

// ── create_trip ───────────────────────────────────────────────────────────────

async function createTrip(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  if (!ctx.userId && !ctx.sessionId) {
    return JSON.stringify({ error: 'A session is required to create a trip. Please log in or start a session.' })
  }

  const destination = typeof input.destination === 'string' ? input.destination.trim() : ''
  if (!destination) return JSON.stringify({ error: 'destination is required' })

  const parseDate = (v: unknown): Date | null => {
    if (!v || typeof v !== 'string') return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }

  const trip = await prisma.trip.create({
    data: {
      userId:    ctx.userId   ?? null,
      sessionId: ctx.userId   ? null : (ctx.sessionId ?? null),
      destination,
      origin:    typeof input.origin    === 'string'  ? input.origin    : null,
      title:     typeof input.title     === 'string'  ? input.title     : `${destination} Trip`,
      adults:    typeof input.adults    === 'number'  ? input.adults    : 1,
      children:  typeof input.children  === 'number'  ? input.children  : 0,
      infants:   typeof input.infants   === 'number'  ? input.infants   : 0,
      currency:  typeof input.currency  === 'string'  ? input.currency  : 'GBP',
      startDate: parseDate(input.start_date),
      endDate:   parseDate(input.end_date),
      status:    'DRAFT',
    },
    select: { id: true, title: true, destination: true, status: true },
  })

  // Server-authoritative CommercialEvent — non-blocking
  prisma.commercialEvent.create({
    data: {
      event:    'jade_trip_created',
      userId:   ctx.userId ?? null,
      metadata: { tripId: trip.id, destination, source: 'jade_chat' },
    },
  }).catch(() => {})

  return JSON.stringify({
    ok:          true,
    tripId:      trip.id,
    destination: trip.destination,
    title:       trip.title,
    status:      trip.status,
  })
}

// ── update_trip ───────────────────────────────────────────────────────────────

async function updateTrip(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  const tripId = input.trip_id as string | undefined
  if (!tripId) return JSON.stringify({ error: 'trip_id is required' })

  const owned = await validateTripOwnership(tripId, ctx)
  if (!owned) return JSON.stringify({ error: 'Trip not found or access denied' })

  const parseDate = (v: unknown): Date | null | undefined => {
    if (v === null || v === '') return null
    if (!v || typeof v !== 'string') return undefined
    const d = new Date(v)
    return isNaN(d.getTime()) ? undefined : d
  }

  const data: Record<string, unknown> = {}
  if (typeof input.destination === 'string') data.destination = input.destination
  if (typeof input.origin      === 'string') data.origin      = input.origin
  if (typeof input.title       === 'string') data.title       = input.title
  if (typeof input.currency    === 'string') data.currency    = input.currency
  if (typeof input.adults      === 'number') data.adults      = input.adults
  if (typeof input.children    === 'number') data.children    = input.children
  if (typeof input.infants     === 'number') data.infants     = input.infants
  if (input.start_date !== undefined) {
    const d = parseDate(input.start_date)
    if (d !== undefined) data.startDate = d
  }
  if (input.end_date !== undefined) {
    const d = parseDate(input.end_date)
    if (d !== undefined) data.endDate = d
  }

  if (Object.keys(data).length === 0) {
    return JSON.stringify({ error: 'No fields to update' })
  }

  await prisma.trip.update({ where: { id: tripId }, data })

  prisma.commercialEvent.create({
    data: {
      event:    'jade_trip_updated',
      userId:   ctx.userId ?? null,
      metadata: { tripId, fields: Object.keys(data), source: 'jade_chat' },
    },
  }).catch(() => {})

  return JSON.stringify({ ok: true, tripId, updated: Object.keys(data) })
}

// ── add_trip_item ─────────────────────────────────────────────────────────────

async function addTripItem(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  const tripId = input.trip_id as string | undefined
  if (!tripId) return JSON.stringify({ error: 'trip_id is required' })

  const owned = await validateTripOwnership(tripId, ctx)
  if (!owned) return JSON.stringify({ error: 'Trip not found or access denied' })

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) return JSON.stringify({ error: 'title is required' })

  const type     = typeof input.type     === 'string' ? input.type     : 'CUSTOM'
  const currency = typeof input.currency === 'string' ? input.currency : 'GBP'

  const item = await prisma.tripItem.create({
    data: {
      tripId,
      type:      type as never,   // TripItemType enum — validated by Prisma
      title,
      location:  typeof input.location   === 'string' ? input.location  : null,
      startTime: typeof input.start_time === 'string' ? input.start_time : null,
      cost:      typeof input.cost       === 'number' ? input.cost      : null,
      currency,
      // sourceId intentionally omitted — Jade does not store supplier IDs
      // metadata intentionally omitted — rateKey must never reach Jade layer
    },
    select: { id: true, type: true, title: true, cost: true, currency: true },
  })

  prisma.commercialEvent.create({
    data: {
      event:    'jade_trip_item_added',
      userId:   ctx.userId ?? null,
      metadata: { tripId, itemId: item.id, type, title, source: 'jade_chat' },
    },
  }).catch(() => {})

  return JSON.stringify({
    ok:       true,
    itemId:   item.id,
    tripId,
    type:     item.type,
    title:    item.title,
    cost:     item.cost,
    currency: item.currency,
  })
}

// ── remove_trip_item ──────────────────────────────────────────────────────────

async function removeTripItem(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  const tripId = input.trip_id as string | undefined
  const itemId = input.item_id as string | undefined
  if (!tripId) return JSON.stringify({ error: 'trip_id is required' })
  if (!itemId) return JSON.stringify({ error: 'item_id is required' })

  const owned = await validateTripOwnership(tripId, ctx)
  if (!owned) return JSON.stringify({ error: 'Trip not found or access denied' })

  const item = await prisma.tripItem.findUnique({
    where:  { id: itemId },
    select: { id: true, tripId: true, type: true, title: true, bookingRef: true, confirmed: true },
  })
  if (!item || item.tripId !== tripId) {
    return JSON.stringify({ error: 'Item not found in this trip' })
  }

  // Check authoritative fulfillment status — purchased items cannot be removed
  const fulfillmentStatus = await getTripItemFulfillmentStatus(
    { bookingRef: item.bookingRef, confirmed: item.confirmed, type: item.type },
    { tripId },
  )

  if (PROTECTED_STATUSES.has(fulfillmentStatus)) {
    return JSON.stringify({
      error: 'protected',
      fulfillmentStatus,
      message: `"${item.title}" cannot be removed — a payment has been received or this booking is confirmed (status: ${fulfillmentStatus}). Please contact the Walz Travels team via WhatsApp or email to modify or cancel this item.`,
    })
  }

  await prisma.tripItem.delete({ where: { id: itemId } })

  prisma.commercialEvent.create({
    data: {
      event:    'jade_trip_item_removed',
      userId:   ctx.userId ?? null,
      metadata: { tripId, itemId, type: item.type, title: item.title, source: 'jade_chat' },
    },
  }).catch(() => {})

  return JSON.stringify({ ok: true, itemId, tripId, removed: item.title })
}

// ── add_search_result_to_trip ─────────────────────────────────────────────────
// Resolves an opaque SearchResultRef, validates trip ownership, and creates a
// TripItem. The supplier payload (rateKey, offerId, etc.) is stored in
// TripItem.metadata and is NEVER returned to Jade.
//
// SECURITY:
//   - resolveSearchRef validates format, expiry, and ownership before proceeding
//   - supplierPayload goes into metadata, which is excluded from all Jade-visible queries
//   - Jade never sees rateKey, offerId, supplierProductId, or any cost fields

async function addSearchResultToTrip(
  input: Record<string, unknown>,
  ctx:   JadeTripToolContext,
): Promise<string> {
  const tripId    = typeof input.trip_id    === 'string' ? input.trip_id.trim()    : null
  const resultRef = typeof input.result_ref === 'string' ? input.result_ref.trim() : null
  const notes     = typeof input.notes      === 'string' ? input.notes             : undefined

  if (!tripId)    return JSON.stringify({ error: 'trip_id is required' })
  if (!resultRef) return JSON.stringify({ error: 'result_ref is required' })

  // Validate trip ownership before resolving the ref
  const owns = await validateTripOwnership(tripId, ctx)
  if (!owns) return JSON.stringify({ error: 'Trip not found or access denied' })

  // Resolve + validate the ref (expiry, ownership, format)
  const resolved = await resolveSearchRef(resultRef, ctx)
  if (!resolved.ok) {
    switch (resolved.reason) {
      case 'SEARCH_RESULT_EXPIRED':
        return JSON.stringify({
          error: 'SEARCH_RESULT_EXPIRED',
          message: 'This search result has expired. Please run a new search to get up-to-date availability and pricing.',
        })
      case 'ACCESS_DENIED':
        return JSON.stringify({ error: 'ACCESS_DENIED', message: 'This result reference does not belong to this session.' })
      default:
        return JSON.stringify({ error: 'INVALID_RESULT_REFERENCE', message: 'The result reference is invalid. Please search again.' })
    }
  }

  const { ref } = resolved

  // Map SearchProductType → TripItemType (all valid per schema)
  const itemTypeMap: Record<string, string> = {
    FLIGHT:   'FLIGHT',
    HOTEL:    'HOTEL',
    ACTIVITY: 'ACTIVITY',
    TRANSFER: 'TRANSFER',
    ESIM:     'ESIM',
  }
  const itemType = itemTypeMap[ref.productType]
  if (!itemType) {
    return JSON.stringify({ error: `Unsupported product type: ${ref.productType}` })
  }

  // Build TripItem — customer-safe fields only
  // supplierPayload goes into metadata (never returned to Jade by any get_trip query)
  const item = await prisma.tripItem.create({
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
      // supplierPayload stored server-side ONLY — never visible to Jade
      metadata:  ref.supplierPayload as never,
    },
    select: {
      id:        true,
      type:      true,
      title:     true,
      location:  true,
      startTime: true,
      cost:      true,
      currency:  true,
    },
  })

  // Server-authoritative CommercialEvent — non-blocking
  prisma.commercialEvent.create({
    data: {
      event:    'jade_search_result_added',
      userId:   ctx.userId ?? null,
      metadata: {
        tripId,
        itemId:      item.id,
        productType: ref.productType,
        title:       ref.title,
        sellingPrice: ref.sellingPrice,
        currency:    ref.currency,
        source:      'jade_chat',
      },
    },
  }).catch(() => {})

  return JSON.stringify({
    ok:          true,
    itemId:      item.id,
    tripId,
    productType: ref.productType,
    title:       ref.title,
    sellingPrice: ref.sellingPrice,
    currency:    ref.currency,
    location:    item.location,
    startTime:   item.startTime,
    message:     `${ref.title} has been added to your trip. I'll now put a hold on this for you — a member of the Walz team will confirm and send you a payment link shortly.`,
  })
}
