import { createHmac } from 'crypto'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BUSINESS } from '@/lib/config/business'
import { getSupabaseAdmin } from '@/lib/supabase'
import { PortalPage } from './_PortalPage'
import type { PortalDTO, PortalAcceptance } from './_PortalPage'
import { derivePortalStatus } from '@/lib/v2/portal-status'
import type { FulfilmentSummary, PaymentSummary } from '@/lib/v2/portal-status'
import type {
  PublicProposalDTO,
  ProposalFlight,
  ProposalHotel,
  ProposalTransfer,
  ProposalTour,
  ProposalDay,
  ProposalPriceLine,
  ProposalPackageOption,
  ProposalPaymentMilestone,
  ProposalTrain,
  ProposalFerry,
} from '../_types'
import type { PublicOptionGroup, PublicOptionItem } from '@/lib/v2/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ ref: string }>; searchParams?: Promise<Record<string, string | undefined>> }

// ── SEO: noindex — private confirmed-trip pages must not be crawled ───────────
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ref } = await params
  const itin = await prisma.itinerary.findUnique({
    where: { referenceNumber: ref },
    select: { title: true, destination: true, status: true },
  })

  const title = itin?.title
    ? `${itin.title} — My Trip | Walz Travels`
    : 'My Trip | Walz Travels'

  return {
    title,
    description: itin?.destination
      ? `Your confirmed trip to ${itin.destination}, curated by Walz Travels.`
      : 'Your confirmed trip, curated by Walz Travels.',
    robots: { index: false, follow: false },
  }
}

// ── Helpers (mirror the proposal page — do not share across files) ────────────

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try { return JSON.parse(json) as T } catch { return fallback }
}

function toIso(d: Date | null | undefined): string | undefined {
  if (!d) return undefined
  return d.toISOString()
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ClientPortalPage({ params, searchParams }: Params) {
  const { ref } = await params
  const sp = searchParams ? await searchParams : {}
  const paymentConfirming = sp?.payment === 'confirming'

  const itin = await prisma.itinerary.findUnique({ where: { referenceNumber: ref } })
  if (!itin) notFound()

  // Portal is for accepted and revision-pending itineraries.
  // revision_sent stays accessible so clients see the REVISION_PENDING CTA.
  if (itin.status !== 'approved' && itin.status !== 'revision_accepted' && itin.status !== 'revision_sent') notFound()

  // ── Raw types — only client-safe fields named. Internal fields are listed
  //    in comments so reviewers can see what is deliberately excluded. ─────────

  type RawFlight = {
    from?: string; to?: string; fromCity?: string; toCity?: string
    airline?: string; flightNumber?: string; date?: string
    time?: string; departureTime?: string; arrivalTime?: string
    class?: string; pnr?: string; stops?: number
    airlineLogoUrl?: string; imageUrl?: string
    // NEVER: cost, supplierCost, netRate, markup, rateKey, iataCode
  }
  type RawHotel = {
    name?: string; location?: string; checkIn?: string; checkOut?: string
    roomType?: string; nights?: number; mealPlan?: string; images?: string[]
    // NEVER: cost, supplierCost, wholesale_cost
  }
  type RawTransfer = {
    type?: string; from?: string; to?: string; date?: string
    vehicle?: string; images?: string[]
    // NEVER: cost, supplierCost
  }
  type RawTour = {
    name?: string; location?: string; date?: string; time?: string
    duration?: string; provider?: string; notes?: string; images?: string[]
    // NEVER: cost, supplierCost, supplierId
  }
  type RawDay = {
    day: number; title: string; destination?: string; description?: string
    activities?: string[]; meals?: string; accommodation?: string
    clientNotes?: string; notes?: string
    // NEVER: internalNotes
  }
  type RawTrain = {
    from?: string; to?: string; date?: string
    departureTime?: string; arrivalTime?: string
    trainNumber?: string; class?: string; provider?: string
    image?: string; images?: string[]
    // NEVER: cost, supplierCost, notes, supplierId, pnr
  }
  type RawFerry = {
    from?: string; to?: string; date?: string
    departureTime?: string; arrivalTime?: string
    operator?: string; class?: string; vessel?: string
    image?: string; images?: string[]
    // NEVER: cost, supplierCost, notes, supplierId
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
  }

  // AcceptanceSnapshot — only fields we need for the portal DTO.
  // Handles both V1 (version absent or 1) and V2 (version: 2).
  type ParsedSnap = {
    version?: number
    acceptedAt?: string
    acceptedBy?: string
    acceptedTotal?: number | null
    deposit?: number | null
    currency?: string
    // V2 only
    selectedGroups?: Array<{
      groupId: string
      groupName: string
      selectedItems: Array<{ name: string }>
    }>
  }

  // ── Parse raw JSON arrays ─────────────────────────────────────────────────────
  const rawFlights   = safeParse<RawFlight[]>(itin.flights, [])
  const rawHotels    = safeParse<RawHotel[]>(itin.hotels, [])
  const rawTransfers = safeParse<RawTransfer[]>(itin.transfers, [])
  const rawTours     = safeParse<RawTour[]>(itin.tours, [])
  const rawDays      = safeParse<RawDay[]>(itin.days, [])
  const rawOptions   = safeParse<RawOptions>(itin.options, {})
  const rawOptsAll   = safeParse<Record<string, unknown>>(itin.options, {})

  // Derive a short-lived HMAC payment token instead of exposing the raw approvalToken.
  // Payload: ref:acceptanceVersion:hourSlot — matches the initiate route's HMAC validation.
  // The raw token (email credential) must never appear in portal HTML — anyone with
  // WALZ-XXXX can view the portal, so exposing the raw token would let anyone initiate
  // payment. The HMAC token is valid for 1–2 hours; the initiate route validates it.
  const _rawApprovalToken = typeof rawOptsAll.approvalToken === 'string' ? rawOptsAll.approvalToken : ''
  const PAYMENT_SECRET    = process.env.PAYMENT_HMAC_SECRET ?? process.env.NEXTAUTH_SECRET ?? ''
  // Parse acceptance version directly from selectedOption (snap is declared later)
  const acceptanceVersion: number = (() => {
    try {
      const s = JSON.parse(itin.selectedOption ?? '{}') as { version?: unknown }
      return typeof s.version === 'number' ? s.version : 1
    } catch { return 1 }
  })()
  const hourSlot = Math.floor(Date.now() / (60 * 60 * 1000))
  const approvalToken     = PAYMENT_SECRET
    ? createHmac('sha256', PAYMENT_SECRET)
        .update(`${itin.referenceNumber}:${acceptanceVersion}:${hourSlot}`)
        .digest('hex')
    : _rawApprovalToken  // dev fallback only — PAYMENT_HMAC_SECRET or NEXTAUTH_SECRET required in production
  const rawTrains    = safeParse<RawTrain[]>((itin as Record<string, unknown>).trains as string | null, [])
  const rawFerries   = safeParse<RawFerry[]>((itin as Record<string, unknown>).ferries as string | null, [])

  // ── Acceptance snapshot ───────────────────────────────────────────────────────
  // If selectedOption is null / unparseable, we still render the portal — just
  // with zeroed-out acceptance values (see constraint 2).
  const snap = safeParse<ParsedSnap>(itin.selectedOption, {})

  const isV2 = snap.version === 2

  const acceptance: PortalAcceptance = {
    version:        isV2 ? 2 : 1,
    acceptedAt:     snap.acceptedAt  ?? '',
    acceptedBy:     snap.acceptedBy  ?? '',
    acceptedTotal:  snap.acceptedTotal ?? 0,
    deposit:        snap.deposit ?? null,
    currency:       snap.currency ?? itin.currency,
    portalStatus:   'ACCEPTED', // overwritten below after fulfilment/payment fetch
    paidTotal:      0,           // overwritten below after payments query
    approvalToken,
    paymentConfirming,
    ...(isV2 && snap.selectedGroups && snap.selectedGroups.length > 0
      ? {
          selectedGroupSummary: snap.selectedGroups.map(g => ({
            groupName:     g.groupName,
            selectedItems: g.selectedItems.map(item => item.name),
          })),
        }
      : {}),
  }

  // ── Explicit client-safe field selection ──────────────────────────────────────
  // No supplier costs, internal notes, markup, or booking refs pass through.

  const flights: ProposalFlight[] = rawFlights.map(f => ({
    from:           f.from,
    to:             f.to,
    fromCity:       f.fromCity,
    toCity:         f.toCity,
    airline:        f.airline,
    flightNumber:   f.flightNumber,
    date:           f.date,
    departureTime:  f.departureTime ?? f.time,
    arrivalTime:    f.arrivalTime,
    class:          f.class,
    // pnr intentionally excluded from PortalDTO — must not appear in client response
    stops:          f.stops,
    airlineLogoUrl: f.airlineLogoUrl,
    imageUrl:       f.imageUrl,
  }))

  const hotels: ProposalHotel[] = rawHotels.map(h => ({
    name:     h.name,
    location: h.location,
    checkIn:  h.checkIn,
    checkOut: h.checkOut,
    roomType: h.roomType,
    nights:   h.nights,
    mealPlan: h.mealPlan,
    images:   h.images,
  }))

  const transfers: ProposalTransfer[] = rawTransfers.map(t => ({
    type:    t.type,
    from:    t.from,
    to:      t.to,
    date:    t.date,
    vehicle: t.vehicle,
    images:  t.images,
  }))

  const tours: ProposalTour[] = rawTours.map(t => ({
    name:     t.name,
    location: t.location,
    date:     t.date,
    time:     t.time,
    duration: t.duration,
    provider: t.provider,
    notes:    t.notes,
    images:   t.images,
  }))

  const trains: ProposalTrain[] = rawTrains.map(t => ({
    from:          t.from,
    to:            t.to,
    date:          t.date,
    departureTime: t.departureTime,
    arrivalTime:   t.arrivalTime,
    trainNumber:   t.trainNumber,
    class:         t.class,
    provider:      t.provider,
    image:         t.image,
    images:        t.images,
  }))

  const ferries: ProposalFerry[] = rawFerries.map(f => ({
    from:          f.from,
    to:            f.to,
    date:          f.date,
    departureTime: f.departureTime,
    arrivalTime:   f.arrivalTime,
    operator:      f.operator,
    class:         f.class,
    vessel:        f.vessel,
    image:         f.image,
    images:        f.images,
  }))

  const days: ProposalDay[] = rawDays.map(d => ({
    day:           d.day,
    title:         d.title,
    destination:   d.destination,
    description:   d.description,
    activities:    d.activities,
    meals:         d.meals,
    accommodation: d.accommodation,
    clientNotes:   d.clientNotes ?? d.notes,
  }))

  const priceBreakdown: ProposalPriceLine[] = safeParse<RawPriceRow[]>(itin.priceBreakdown, []).map(r => ({
    item:        r.item,
    description: r.description,
    cost:        r.cost,
  }))

  const packageOptions: ProposalPackageOption[] = (rawOptions.packageOptions ?? []).map(o => ({
    id:          o.id,
    name:        o.name,
    price:       o.price,
    currency:    o.currency,
    description: o.description,
    features:    o.features ?? [],
    isSelected:  o.isSelected,
  }))

  const paymentSchedule: ProposalPaymentMilestone[] = (rawOptions.paymentSchedule ?? []).map(m => ({
    label:    m.label,
    amount:   m.amount,
    currency: m.currency,
    dueDate:  m.dueDate,
    paid:     m.paid,
  }))

  // ── Assemble base PublicProposalDTO ───────────────────────────────────────────
  const dto: PublicProposalDTO = {
    referenceNumber:   itin.referenceNumber,
    title:             itin.title,
    status:            itin.status,
    clientName:        itin.clientName ?? undefined,
    destination:       itin.destination ?? undefined,
    startDate:         toIso(itin.startDate),
    endDate:           toIso(itin.endDate),
    duration:          itin.duration ?? undefined,
    numberOfTravellers: itin.numberOfTravellers,
    tripType:          itin.tripType ?? undefined,
    currency:          itin.currency,
    coverImage:        itin.coverImage ?? undefined,
    overview:          itin.overview ?? undefined,
    terms:             itin.terms ?? undefined,
    totalPrice:        itin.totalPrice ?? undefined,
    deposit:           itin.deposit ?? undefined,
    depositDue:        itin.depositDue?.toISOString() ?? undefined,
    balanceDue:        itin.balanceDue?.toISOString() ?? undefined,
    days,
    flights,
    hotels,
    transfers,
    tours,
    trains,
    ferries,
    inclusions:        safeParse<string[]>(itin.inclusions, []),
    exclusions:        safeParse<string[]>(itin.exclusions, []),
    priceBreakdown,
    packageOptions,
    paymentSchedule,
    contact: {
      globalWhatsAppE164:    BUSINESS.contacts.globalWhatsapp.e164,
      globalWhatsAppDisplay: BUSINESS.contacts.globalWhatsapp.display,
      nigeriaWhatsAppE164:   BUSINESS.contacts.nigeriaWhatsapp.e164,
      nigeriaWhatsAppDisplay: BUSINESS.contacts.nigeriaWhatsapp.display,
      email:                 BUSINESS.contacts.email,
      emergencyPhoneE164:    BUSINESS.contacts.emergencyPhone.e164,
      emergencyPhoneDisplay: BUSINESS.contacts.emergencyPhone.display,
    },
    // approvalToken intentionally absent — portal is post-acceptance
    // acceptedAt / acceptedBy / acceptedTotal / acceptedOptionIds: carried in acceptance
  }

  // ── V2: Fetch option groups (graceful — V1 itineraries have no rows) ──────────
  // Same pattern as the proposal page. No internal fields included.
  let optionGroups: PublicOptionGroup[] = []

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
      .from('itinerary_option_groups')
      .select(
        'id, name, description, category, selection_mode, pricing_mode, required, ' +
        'min_selections, max_selections, sort_order, ' +
        'option_items(id, group_id, name, description, client_price, currency, ' +
        'price_adjustment, recommended, default_selected, active, sort_order, ' +
        'image_url, quote_expires_at)'
      )
      .eq('itinerary_id', itin.id)
      .eq('active', true)
      .eq('client_visible', true)
      .order('sort_order', { ascending: true })

    if (rawGroups && rawGroups.length > 0) {
      const mapped: PublicOptionGroup[] = (rawGroups as unknown as RawGroup[])
        .map(g => {
          const items: PublicOptionItem[] = (g.option_items ?? [])
            .filter(item => item.active === true)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(item => ({
              id:              item.id,
              groupId:         item.group_id,
              name:            item.name,
              description:     item.description ?? undefined,
              clientPrice:     item.client_price,
              currency:        item.currency,
              priceAdjustment: item.price_adjustment,
              recommended:     item.recommended,
              defaultSelected: item.default_selected,
              active:          item.active,
              sortOrder:       item.sort_order,
              imageUrl:        item.image_url ?? undefined,
              quoteExpiresAt:  item.quote_expires_at ?? undefined,
            }))
          return {
            id:            g.id,
            name:          g.name,
            description:   g.description ?? undefined,
            category:      g.category as PublicOptionGroup['category'],
            selectionMode: g.selection_mode as PublicOptionGroup['selectionMode'],
            pricingMode:   g.pricing_mode as PublicOptionGroup['pricingMode'],
            required:      g.required,
            minSelections: g.min_selections,
            maxSelections: g.max_selections,
            sortOrder:     g.sort_order,
            items,
          }
        })
        .filter(g => g.items.length > 0)

      if (mapped.length > 0) {
        optionGroups = mapped
      }
    }
  } catch {
    // Supabase not configured or table absent — degrade gracefully
    optionGroups = []
  }

  dto.optionGroups      = optionGroups
  dto.acceptanceVersion = isV2 ? 2 : 1

  // ── Fetch fulfilment items and payments (graceful — if tables absent portal renders with ACCEPTED) ──
  let fulfilmentItems: FulfilmentSummary[] = []
  let payments: PaymentSummary[] = []

  try {
    const supabase = getSupabaseAdmin()

    const [{ data: rawFulfilment }, { data: rawPayments }] = await Promise.all([
      supabase
        .from('itinerary_fulfilment_items')
        .select('id, status')
        .eq('itinerary_id', itin.id),
      supabase
        .from('itinerary_payments')
        .select('id, status, amount')
        // P0: itinerary_payments stores itinerary_id as the reference string (WALZ-XXX),
        // not the Prisma CUID. Webhooks and initiate route both write it by reference.
        .eq('itinerary_id', itin.referenceNumber),
    ])

    if (rawFulfilment) {
      fulfilmentItems = (rawFulfilment as { id: string; status: string }[]).map(r => ({
        id: r.id,
        status: r.status,
      }))
    }
    if (rawPayments) {
      payments = (rawPayments as { id: string; status: string; amount?: number }[]).map(r => ({
        id: r.id,
        status: r.status,
      }))
      acceptance.paidTotal = (rawPayments as { status: string; amount?: number }[])
        .filter(r => r.status === 'PAID')
        .reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
    }
  } catch {
    // Supabase not configured or tables absent — degrade gracefully (status stays ACCEPTED)
    fulfilmentItems = []
    payments = []
  }

  const portalStatus = derivePortalStatus(fulfilmentItems, payments, itin.status)
  acceptance.portalStatus = portalStatus

  // ── Assemble final PortalDTO ──────────────────────────────────────────────────
  const portalDto: PortalDTO = {
    ...dto,
    acceptance,
  }

  return <PortalPage portal={portalDto} />
}
