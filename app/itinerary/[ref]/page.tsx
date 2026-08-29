import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BUSINESS } from '@/lib/config/business'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ProposalPage } from './_ProposalPage'
import type { PublicProposalDTO, ProposalFlight, ProposalHotel, ProposalTransfer, ProposalTour, ProposalDay, ProposalPriceLine, ProposalPackageOption, ProposalPaymentMilestone, ProposalTrain, ProposalFerry } from './_types'
import type { PublicOptionGroup, PublicOptionItem } from '@/lib/v2/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ ref: string }> }

// ── SEO: noindex (private itinerary links must not be crawled) ─────────────────
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ref } = await params
  const itin = await prisma.itinerary.findUnique({
    where: { referenceNumber: ref },
    select: { title: true, destination: true, status: true },
  })

  const title = itin?.title
    ? `${itin.title} | Walz Travels`
    : 'Your Trip Proposal | Walz Travels'

  return {
    title,
    description: itin?.destination
      ? `Your personalised trip to ${itin.destination}, curated by Walz Travels.`
      : 'Your personalised trip proposal, curated by Walz Travels.',
    robots: { index: false, follow: false },
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try { return JSON.parse(json) as T } catch { return fallback }
}

function toIso(d: Date | null | undefined): string | undefined {
  if (!d) return undefined
  return d.toISOString()
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ClientItineraryPage({ params }: Params) {
  const { ref } = await params

  const itin = await prisma.itinerary.findUnique({ where: { referenceNumber: ref } })
  if (!itin) notFound()

  // Only public statuses (revision_sent shows revised proposal to client; revision_accepted shows post-acceptance view)
  if (!['proposal', 'approved', 'revision_sent', 'revision_accepted', 'live'].includes(itin.status)) notFound()

  // Async view tracking — fire and forget
  prisma.itinerary.update({
    where: { id: itin.id },
    data: { viewCount: { increment: 1 }, viewedAt: itin.viewedAt ?? new Date(), updatedAt: new Date() },
  }).catch(() => {})

  // ── Safe raw arrays ──────────────────────────────────────────────────────────
  // These raw types may contain supplier-cost or internal fields from older saves.
  // We pick only client-safe fields explicitly below.

  type RawFlight = {
    from?: string; to?: string; fromCity?: string; toCity?: string
    airline?: string; flightNumber?: string; date?: string
    time?: string; departureTime?: string; arrivalTime?: string
    class?: string; pnr?: string; stops?: number
    airlineLogoUrl?: string; imageUrl?: string
    cost?: number | null        // client selling price — safe to expose
    // Deliberately ignored: supplierCost, netRate, markup, rateKey
  }
  type RawTrain = {
    from?: string; to?: string; date?: string
    departureTime?: string; arrivalTime?: string
    trainNumber?: string; class?: string; provider?: string
    image?: string; images?: string[]
    cost?: number | null
    // Ignored: supplierCost, notes, supplierId, pnr
  }
  type RawFerry = {
    from?: string; to?: string; date?: string
    departureTime?: string; arrivalTime?: string
    operator?: string; class?: string; vessel?: string
    image?: string; images?: string[]
    cost?: number | null
    // Ignored: supplierCost, notes, supplierId
  }
  type RawHotel = {
    name?: string; location?: string; checkIn?: string; checkOut?: string
    roomType?: string; nights?: number; mealPlan?: string; images?: string[]
    cost?: number | null
    // Ignored: supplierCost, wholesale_cost
  }
  type RawTransfer = {
    type?: string; from?: string; to?: string; date?: string; vehicle?: string; images?: string[]
    cost?: number | null
  }
  type RawTour = {
    name?: string; location?: string; date?: string; time?: string
    duration?: string; provider?: string; notes?: string; images?: string[]
    cost?: number | null
  }
  type RawDay = {
    day: number; title: string; destination?: string; description?: string
    activities?: string[]; meals?: string; accommodation?: string
    clientNotes?: string; notes?: string
    // Ignored: internalNotes
  }
  type RawPriceRow  = { item: string; description?: string; cost: number }
  type RawPkgOption = {
    id: string; name: string; price: number; currency: string
    description?: string; features: string[]; isSelected?: boolean
  }
  type RawPayment = {
    label: string; amount: number; currency: string; dueDate?: string; paid?: boolean
  }
  type RawOptions = {
    packageOptions?: RawPkgOption[]
    paymentSchedule?: RawPayment[]
    approvalToken?: string
    approvalTokenUsed?: boolean
    approvalTokenExpiresAt?: string
  }

  type RawAcceptanceSnapshot = {
    acceptedAt?: string
    acceptedBy?: string
    acceptedTotal?: number | null
    selectedOptionIds?: string[]
  }

  const rawFlights   = safeParse<RawFlight[]>(itin.flights, [])
  const rawHotels    = safeParse<RawHotel[]>(itin.hotels, [])
  const rawTransfers = safeParse<RawTransfer[]>(itin.transfers, [])
  const rawTours     = safeParse<RawTour[]>(itin.tours, [])
  const rawDays      = safeParse<RawDay[]>(itin.days, [])
  const rawOptions   = safeParse<RawOptions>(itin.options, {})
  const rawTrains    = safeParse<RawTrain[]>((itin as Record<string, unknown>).trains as string | null, [])
  const rawFerries   = safeParse<RawFerry[]>((itin as Record<string, unknown>).ferries as string | null, [])

  // GA5: expose approval token for proposal (initial) and revision_sent (revised proposal awaiting acceptance)
  const rawToken = rawOptions.approvalToken
  const approvalToken = (
    (itin.status === 'proposal' || itin.status === 'revision_sent') &&
    typeof rawToken === 'string' &&
    rawToken.length > 0 &&
    !rawOptions.approvalTokenUsed &&
    (!rawOptions.approvalTokenExpiresAt || new Date(rawOptions.approvalTokenExpiresAt) > new Date())
  ) ? rawToken : undefined

  // GA5: parse acceptance snapshot for accepted status display
  const rawSnap = safeParse<RawAcceptanceSnapshot>(itin.selectedOption, {})
  const isItinAccepted    = itin.status === 'approved' || itin.status === 'revision_accepted'
  const acceptedAt        = isItinAccepted ? rawSnap.acceptedAt : undefined
  const acceptedTotal     = isItinAccepted ? (rawSnap.acceptedTotal ?? null) : undefined
  const acceptedBy        = isItinAccepted ? rawSnap.acceptedBy : undefined
  const acceptedOptionIds = isItinAccepted ? (rawSnap.selectedOptionIds ?? []) : undefined

  // ── Explicit client-safe field selection ─────────────────────────────────────
  // No internal pricing, supplier costs, or admin metadata passes through.

  const flights: ProposalFlight[] = rawFlights.map(f => ({
    from: f.from,
    to: f.to,
    fromCity: f.fromCity,
    toCity: f.toCity,
    airline: f.airline,
    flightNumber: f.flightNumber,
    date: f.date,
    departureTime: f.departureTime ?? f.time,
    arrivalTime: f.arrivalTime,
    class: f.class,
    // PNR is a booking credential — only expose after acceptance (not on proposal/revision_sent)
    pnr: (itin.status === 'approved' || itin.status === 'revision_accepted') ? f.pnr : undefined,
    stops: f.stops,
    airlineLogoUrl: f.airlineLogoUrl,
    imageUrl: f.imageUrl,
    clientPrice: f.cost != null && f.cost > 0 ? f.cost : undefined,
    // NEVER add: iataCode, supplierCost, netRate, markup, rateKey, pnr (pre-acceptance)
  }))

  const hotels: ProposalHotel[] = rawHotels.map(h => ({
    name: h.name,
    location: h.location,
    checkIn: h.checkIn,
    checkOut: h.checkOut,
    roomType: h.roomType,
    nights: h.nights,
    mealPlan: h.mealPlan,
    images: h.images,
    clientPrice: h.cost != null && h.cost > 0 ? h.cost : undefined,
  }))

  const transfers: ProposalTransfer[] = rawTransfers.map(t => ({
    type: t.type,
    from: t.from,
    to: t.to,
    date: t.date,
    vehicle: t.vehicle,
    images: t.images,
    clientPrice: t.cost != null && t.cost > 0 ? t.cost : undefined,
  }))

  const tours: ProposalTour[] = rawTours.map(t => ({
    name: t.name,
    location: t.location,
    date: t.date,
    time: t.time,
    duration: t.duration,
    provider: t.provider,
    notes: t.notes,
    images: t.images,
    clientPrice: t.cost != null && t.cost > 0 ? t.cost : undefined,
  }))

  const trains: ProposalTrain[] = rawTrains.map(t => ({
    from: t.from, to: t.to, date: t.date,
    departureTime: t.departureTime, arrivalTime: t.arrivalTime,
    trainNumber: t.trainNumber, class: t.class, provider: t.provider,
    image: t.image, images: t.images,
    clientPrice: t.cost != null && t.cost > 0 ? t.cost : undefined,
  }))

  const ferries: ProposalFerry[] = rawFerries.map(f => ({
    from: f.from, to: f.to, date: f.date,
    departureTime: f.departureTime, arrivalTime: f.arrivalTime,
    operator: f.operator, class: f.class, vessel: f.vessel,
    image: f.image, images: f.images,
    clientPrice: f.cost != null && f.cost > 0 ? f.cost : undefined,
  }))

  // Component price totals — server-computed from booking.cost (client selling price).
  // NEVER includes supplierCost, netRate, markup, or margin.
  const _sumClientPrice = (arr: { cost?: number | null }[]) => {
    const total = arr.reduce((s, x) => s + (x.cost ?? 0), 0)
    return total > 0 ? total : undefined
  }
  const componentPrices = {
    flights:   _sumClientPrice(rawFlights),
    hotels:    _sumClientPrice(rawHotels),
    transfers: _sumClientPrice(rawTransfers),
    tours:     _sumClientPrice(rawTours),
    trains:    _sumClientPrice(rawTrains),
    ferries:   _sumClientPrice(rawFerries),
  }
  const hasComponentPrices = Object.values(componentPrices).some(v => v != null)

  const days: ProposalDay[] = rawDays.map(d => ({
    day: d.day,
    title: d.title,
    destination: d.destination,
    description: d.description,
    activities: d.activities,
    meals: d.meals,
    accommodation: d.accommodation,
    clientNotes: d.clientNotes ?? d.notes,
  }))

  const priceBreakdown: ProposalPriceLine[] = safeParse<RawPriceRow[]>(itin.priceBreakdown, []).map(r => ({
    item: r.item,
    description: r.description,
    cost: r.cost,
  }))

  const packageOptions: ProposalPackageOption[] = (rawOptions.packageOptions ?? []).map(o => ({
    id: o.id,
    name: o.name,
    price: o.price,
    currency: o.currency,
    description: o.description,
    features: o.features ?? [],
    isSelected: o.isSelected,
  }))

  const paymentSchedule: ProposalPaymentMilestone[] = (rawOptions.paymentSchedule ?? []).map(m => ({
    label: m.label,
    amount: m.amount,
    currency: m.currency,
    dueDate: m.dueDate,
    paid: m.paid,
  }))

  // ── Assemble safe DTO ─────────────────────────────────────────────────────────
  const dto: PublicProposalDTO = {
    referenceNumber: itin.referenceNumber,
    title: itin.title,
    status: itin.status,
    clientName: itin.clientName ?? undefined,
    destination: itin.destination ?? undefined,
    startDate: toIso(itin.startDate),
    endDate: toIso(itin.endDate),
    duration: itin.duration ?? undefined,
    numberOfTravellers: itin.numberOfTravellers,
    tripType: itin.tripType ?? undefined,
    currency: itin.currency,
    coverImage: itin.coverImage ?? undefined,
    overview: itin.overview ?? undefined,
    terms: itin.terms ?? undefined,
    totalPrice: itin.totalPrice ?? undefined,
    deposit: itin.deposit ?? undefined,
    depositDue: itin.depositDue?.toISOString() ?? undefined,
    balanceDue: itin.balanceDue?.toISOString() ?? undefined,
    days,
    flights,
    hotels,
    transfers,
    tours,
    trains,
    ferries,
    inclusions: safeParse<string[]>(itin.inclusions, []),
    exclusions: safeParse<string[]>(itin.exclusions, []),
    priceBreakdown,
    packageOptions,
    paymentSchedule,
    contact: {
      globalWhatsAppE164: BUSINESS.contacts.globalWhatsapp.e164,
      globalWhatsAppDisplay: BUSINESS.contacts.globalWhatsapp.display,
      nigeriaWhatsAppE164: BUSINESS.contacts.nigeriaWhatsapp.e164,
      nigeriaWhatsAppDisplay: BUSINESS.contacts.nigeriaWhatsapp.display,
      email: BUSINESS.contacts.email,
      emergencyPhoneE164: BUSINESS.contacts.emergencyPhone.e164,
      emergencyPhoneDisplay: BUSINESS.contacts.emergencyPhone.display,
    },
    approvalToken,
    acceptedAt,
    acceptedTotal: acceptedTotal ?? undefined,
    acceptedBy,
    acceptedOptionIds,
    componentPrices: hasComponentPrices ? componentPrices : undefined,
  }

  // ── V2: Fetch option groups (graceful — V1 itineraries have no rows) ──────────
  // No internal fields (supplierCost, internalMargin, sourceBookingRef, metadata)
  // are included in the mapped PublicOptionGroup / PublicOptionItem shapes.
  let optionGroups: PublicOptionGroup[] = []
  let acceptanceVersion: 1 | 2 = 1

  try {
    const supabase = getSupabaseAdmin()

    type RawItem = {
      id: string; group_id: string; name: string; description: string | null
      client_price: number; currency: string; price_adjustment: number
      recommended: boolean; default_selected: boolean; active: boolean
      sort_order: number; image_url: string | null; quote_expires_at: string | null
    }
    type RawGroup = {
      id: string; name: string; description: string | null; category: string
      selection_mode: string; pricing_mode: string; required: boolean
      min_selections: number; max_selections: number; sort_order: number
      option_items: RawItem[]
    }

    const { data: rawGroups } = await supabase
      .from('option_groups')
      .select('id, name, description, category, selection_mode, pricing_mode, required, min_selections, max_selections, sort_order, option_items(id, group_id, name, description, client_price, currency, price_adjustment, recommended, default_selected, active, sort_order, image_url, quote_expires_at)')
      .eq('itinerary_id', itin.id)
      .eq('active', true)
      .eq('client_visible', true)
      .order('sort_order', { ascending: true })

    if (rawGroups && rawGroups.length > 0) {
      const mapped: PublicOptionGroup[] = (rawGroups as RawGroup[])
        .map(g => {
          const items: PublicOptionItem[] = (g.option_items ?? [])
            .filter(item => item.active === true)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(item => ({
              id: item.id,
              groupId: item.group_id,
              name: item.name,
              description: item.description ?? undefined,
              clientPrice: item.client_price,
              currency: item.currency,
              priceAdjustment: item.price_adjustment,
              recommended: item.recommended,
              defaultSelected: item.default_selected,
              active: item.active,
              sortOrder: item.sort_order,
              imageUrl: item.image_url ?? undefined,
              quoteExpiresAt: item.quote_expires_at ?? undefined,
            }))
          return {
            id: g.id,
            name: g.name,
            description: g.description ?? undefined,
            category: g.category as PublicOptionGroup['category'],
            selectionMode: g.selection_mode as PublicOptionGroup['selectionMode'],
            pricingMode: g.pricing_mode as PublicOptionGroup['pricingMode'],
            required: g.required,
            minSelections: g.min_selections,
            maxSelections: g.max_selections,
            sortOrder: g.sort_order,
            items,
          }
        })
        .filter(g => g.items.length > 0)

      if (mapped.length > 0) {
        optionGroups = mapped
        acceptanceVersion = 2
      }
    }
  } catch {
    // Supabase not configured or table absent — V1 flow unchanged
    optionGroups = []
    acceptanceVersion = 1
  }

  dto.optionGroups      = optionGroups
  dto.acceptanceVersion = acceptanceVersion

  return <ProposalPage proposal={dto} />
}
