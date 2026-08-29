import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

// ─── Fields that must NEVER be mutated via this route ─────────────────────────
const PROTECTED_TOP_LEVEL = new Set([
  'selectedOption',
  'status',
  'options',
  'clientSignature',
  'approvedBy',
  'approvedAt',
  'sentAt',
  'viewCount',
  'viewedAt',
  'createdAt',
  'updatedAt',
  'id',
  'referenceNumber',
  'clientAccountId',
  'clientEmail',
  'clientPhone',
  'clientName',
  // Approval and payment integrity — all sub-fields of the options JSON and
  // the selectedOption snapshot are protected via 'options' and 'selectedOption'
  // above. These top-level aliases are added as explicit defense-in-depth so
  // that if any future tool path passes them as params they are rejected here.
  'approvalToken',
  'approvalTokenExpiresAt',
  'approvalTokenUsed',
  'approvalTokenIssuedAt',
  'sentOptionsHash',
  'sentOptionsHashCreatedAt',
  'acceptedTotal',
  'acceptedAt',
  'acceptedBy',
  'acceptedOptionIds',
])

// ─── Allowed day fields ────────────────────────────────────────────────────────
const ALLOWED_DAY_FIELDS = new Set([
  'title',
  'description',
  'activities',
  'meals',
  'accommodation',
  'destination',
  'weather',
  'dressCode',
  'clientNotes',
  'internalNotes',
  'notes',
])

// ─── Allowed hotel fields ──────────────────────────────────────────────────────
// 'confirmationNo' removed — hotel reservation confirmation numbers are supplier
// booking credentials. Jade must not overwrite them. hotelbedsCancellationReference,
// supplierId, and duffelOrderId are also not listed here and remain unwritable.
const ALLOWED_HOTEL_FIELDS = new Set([
  'name',
  'location',
  'checkIn',
  'checkOut',
  'nights',
  'roomType',
  'stars',
  'boardBasis',
  'notes',
  'websiteUrl',
  'status',
])

// ─── Allowed flight fields ─────────────────────────────────────────────────────
// Issue 9: 'pnr' removed — PNR is a booking credential that Jade must not overwrite
const ALLOWED_FLIGHT_FIELDS = new Set([
  'from',
  'to',
  'airline',
  'iataCode',
  'flightNumber',
  'date',
  'time',
  'arrivalTime',
  'class',
  'notes',
  'status',
  'baggage',
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? JSON.parse(s) as T : fallback } catch { return fallback }
}

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleUpdateOverview(
  itineraryId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; changed?: object; requiresConfirmation?: boolean; message?: string; error?: string }> {
  const overview = typeof params.overview === 'string' ? params.overview.trim() : null
  if (!overview) return { ok: false, error: 'overview must be a non-empty string' }

  await prisma.itinerary.update({
    where: { id: itineraryId },
    data: { overview, updatedAt: new Date() },
  })
  return { ok: true, changed: { overview } }
}

async function handleUpdateDay(
  itineraryId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; changed?: object; requiresConfirmation?: boolean; message?: string; error?: string }> {
  const dayIndex = typeof params.dayIndex === 'number' ? params.dayIndex : null
  const field = typeof params.field === 'string' ? params.field : null
  const value = params.value

  if (dayIndex === null || dayIndex < 0) return { ok: false, error: 'dayIndex must be a non-negative number' }
  if (!field) return { ok: false, error: 'field is required' }
  if (!ALLOWED_DAY_FIELDS.has(field)) {
    return { ok: false, error: `field "${field}" is not allowed. Allowed: ${[...ALLOWED_DAY_FIELDS].join(', ')}` }
  }

  const existing = await prisma.itinerary.findUnique({ where: { id: itineraryId }, select: { days: true } })
  if (!existing) return { ok: false, error: 'Itinerary not found' }

  const days = safeParse<Array<Record<string, unknown>>>(existing.days, [])
  if (dayIndex >= days.length) {
    return { ok: false, error: `dayIndex ${dayIndex} out of range (itinerary has ${days.length} days)` }
  }

  // Validate value type: activities must be string[]
  if (field === 'activities') {
    if (!Array.isArray(value)) return { ok: false, error: 'activities value must be an array of strings' }
    days[dayIndex][field] = (value as unknown[]).map(String)
  } else {
    days[dayIndex][field] = typeof value === 'string' ? value : String(value ?? '')
  }

  await prisma.itinerary.update({
    where: { id: itineraryId },
    data: { days: JSON.stringify(days), updatedAt: new Date() },
  })

  return { ok: true, changed: { dayIndex, field, newValue: days[dayIndex][field] } }
}

async function handleAddDay(
  itineraryId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; changed?: object; requiresConfirmation?: boolean; message?: string; error?: string }> {
  const title = typeof params.title === 'string' ? params.title.trim() : 'New Day'
  const description = typeof params.description === 'string' ? params.description : ''
  const date = typeof params.date === 'string' ? params.date : ''

  const existing = await prisma.itinerary.findUnique({ where: { id: itineraryId }, select: { days: true } })
  if (!existing) return { ok: false, error: 'Itinerary not found' }

  const days = safeParse<Array<Record<string, unknown>>>(existing.days, [])
  const nextDayNumber = days.length + 1

  const newDay: Record<string, unknown> = {
    day: nextDayNumber,
    title,
    description,
    activities: [],
    meals: '',
    accommodation: '',
    destination: '',
    weather: '',
    dressCode: '',
    notes: date ? `Date: ${date}` : '',
  }

  days.push(newDay)

  await prisma.itinerary.update({
    where: { id: itineraryId },
    data: { days: JSON.stringify(days), updatedAt: new Date() },
  })

  return { ok: true, changed: { addedDay: newDay, totalDays: days.length } }
}

async function handleRemoveDay(
  itineraryId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; changed?: object; requiresConfirmation?: boolean; message?: string; error?: string }> {
  const dayIndex = typeof params.dayIndex === 'number' ? params.dayIndex : null
  const confirmed = params.confirmed === true

  if (dayIndex === null || dayIndex < 0) return { ok: false, error: 'dayIndex must be a non-negative number' }

  if (!confirmed) {
    const existing = await prisma.itinerary.findUnique({ where: { id: itineraryId }, select: { days: true } })
    if (!existing) return { ok: false, error: 'Itinerary not found' }
    const days = safeParse<Array<Record<string, unknown>>>(existing.days, [])
    const day = days[dayIndex]
    const label = day ? `Day ${(day.day as number) || dayIndex + 1}: ${String(day.title || 'Untitled')}` : `Day at index ${dayIndex}`
    return {
      ok: false,
      requiresConfirmation: true,
      message: `Are you sure you want to remove "${label}"? This action cannot be undone.`,
    }
  }

  const existing = await prisma.itinerary.findUnique({ where: { id: itineraryId }, select: { days: true } })
  if (!existing) return { ok: false, error: 'Itinerary not found' }

  const days = safeParse<Array<Record<string, unknown>>>(existing.days, [])
  if (dayIndex >= days.length) {
    return { ok: false, error: `dayIndex ${dayIndex} out of range (itinerary has ${days.length} days)` }
  }

  const removed = days[dayIndex]
  days.splice(dayIndex, 1)
  // Renumber remaining days sequentially
  days.forEach((d, i) => { d.day = i + 1 })

  await prisma.itinerary.update({
    where: { id: itineraryId },
    data: { days: JSON.stringify(days), updatedAt: new Date() },
  })

  return { ok: true, changed: { removedDay: removed, totalDays: days.length } }
}

async function handleUpdateHotelField(
  itineraryId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; changed?: object; requiresConfirmation?: boolean; message?: string; error?: string }> {
  const hotelIndex = typeof params.hotelIndex === 'number' ? params.hotelIndex : null
  const field = typeof params.field === 'string' ? params.field : null
  const value = params.value

  if (hotelIndex === null || hotelIndex < 0) return { ok: false, error: 'hotelIndex must be a non-negative number' }
  if (!field) return { ok: false, error: 'field is required' }
  if (!ALLOWED_HOTEL_FIELDS.has(field)) {
    return { ok: false, error: `field "${field}" is not allowed. Allowed: ${[...ALLOWED_HOTEL_FIELDS].join(', ')}` }
  }

  const existing = await prisma.itinerary.findUnique({ where: { id: itineraryId }, select: { hotels: true } })
  if (!existing) return { ok: false, error: 'Itinerary not found' }

  const hotels = safeParse<Array<Record<string, unknown>>>(existing.hotels, [])
  if (hotelIndex >= hotels.length) {
    return { ok: false, error: `hotelIndex ${hotelIndex} out of range (itinerary has ${hotels.length} hotels)` }
  }

  hotels[hotelIndex][field] = typeof value === 'number' ? value : typeof value === 'string' ? value : String(value ?? '')

  await prisma.itinerary.update({
    where: { id: itineraryId },
    data: { hotels: JSON.stringify(hotels), updatedAt: new Date() },
  })

  return { ok: true, changed: { hotelIndex, field, newValue: hotels[hotelIndex][field] } }
}

async function handleUpdateFlightField(
  itineraryId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; changed?: object; requiresConfirmation?: boolean; message?: string; error?: string }> {
  const flightIndex = typeof params.flightIndex === 'number' ? params.flightIndex : null
  const field = typeof params.field === 'string' ? params.field : null
  const value = params.value

  if (flightIndex === null || flightIndex < 0) return { ok: false, error: 'flightIndex must be a non-negative number' }
  if (!field) return { ok: false, error: 'field is required' }
  if (!ALLOWED_FLIGHT_FIELDS.has(field)) {
    return { ok: false, error: `field "${field}" is not allowed. Allowed: ${[...ALLOWED_FLIGHT_FIELDS].join(', ')}` }
  }

  const existing = await prisma.itinerary.findUnique({ where: { id: itineraryId }, select: { flights: true } })
  if (!existing) return { ok: false, error: 'Itinerary not found' }

  const flights = safeParse<Array<Record<string, unknown>>>(existing.flights, [])
  if (flightIndex >= flights.length) {
    return { ok: false, error: `flightIndex ${flightIndex} out of range (itinerary has ${flights.length} flights)` }
  }

  flights[flightIndex][field] = typeof value === 'string' ? value : String(value ?? '')

  await prisma.itinerary.update({
    where: { id: itineraryId },
    data: { flights: JSON.stringify(flights), updatedAt: new Date() },
  })

  return { ok: true, changed: { flightIndex, field, newValue: flights[flightIndex][field] } }
}

async function handleUpdatePricingField(
  itineraryId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; changed?: object; requiresConfirmation?: boolean; message?: string; error?: string }> {
  const field = typeof params.field === 'string' ? params.field : null
  const value = typeof params.value === 'number' ? params.value : null

  if (!field || !['totalPrice', 'deposit'].includes(field)) {
    return { ok: false, error: 'field must be "totalPrice" or "deposit"' }
  }
  if (value === null || value < 0) return { ok: false, error: 'value must be a non-negative number' }

  const existing = await prisma.itinerary.findUnique({
    where: { id: itineraryId },
    select: { status: true },
  })
  if (!existing) return { ok: false, error: 'Itinerary not found' }

  if (existing.status === 'approved') {
    return { ok: false, error: 'Cannot modify pricing on an approved itinerary' }
  }

  await prisma.itinerary.update({
    where: { id: itineraryId },
    data: { [field]: value, updatedAt: new Date() },
  })

  return { ok: true, changed: { [field]: value } }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { itineraryId?: unknown; tool?: unknown; params?: unknown }
  try {
    body = await req.json() as { itineraryId?: unknown; tool?: unknown; params?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const itineraryId = typeof body.itineraryId === 'string' ? body.itineraryId.trim() : null
  const tool = typeof body.tool === 'string' ? body.tool.trim() : null
  const params = body.params && typeof body.params === 'object' && !Array.isArray(body.params)
    ? body.params as Record<string, unknown>
    : {}

  if (!itineraryId) return NextResponse.json({ error: 'itineraryId is required' }, { status: 400 })
  if (!tool) return NextResponse.json({ error: 'tool is required' }, { status: 400 })

  // Reject any attempt to mutate protected fields through params
  for (const key of Object.keys(params)) {
    if (PROTECTED_TOP_LEVEL.has(key)) {
      return NextResponse.json({ error: `Mutation of "${key}" is not allowed via this route` }, { status: 403 })
    }
  }

  // Verify itinerary exists and belongs to an admin-accessible record
  const itinerary = await prisma.itinerary.findUnique({
    where: { id: itineraryId },
    select: { id: true, status: true },
  })
  if (!itinerary) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })

  let result: { ok: boolean; changed?: object; requiresConfirmation?: boolean; message?: string; error?: string }

  switch (tool) {
    case 'updateOverview':
      result = await handleUpdateOverview(itineraryId, params)
      break
    case 'updateDay':
      result = await handleUpdateDay(itineraryId, params)
      break
    case 'addDay':
      result = await handleAddDay(itineraryId, params)
      break
    case 'removeDay':
      result = await handleRemoveDay(itineraryId, params)
      break
    case 'updateHotelField':
      result = await handleUpdateHotelField(itineraryId, params)
      break
    case 'updateFlightField':
      result = await handleUpdateFlightField(itineraryId, params)
      break
    case 'updatePricingField':
      result = await handleUpdatePricingField(itineraryId, params)
      break
    default:
      return NextResponse.json({ error: `Unknown tool: "${tool}"` }, { status: 400 })
  }

  if (result.requiresConfirmation) {
    return NextResponse.json(result, { status: 200 })
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Mutation failed' }, { status: 422 })
  }

  return NextResponse.json({ ok: true, changed: result.changed })
}
