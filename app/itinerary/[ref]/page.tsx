import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BUSINESS } from '@/lib/config/business'
import { ProposalPage } from './_ProposalPage'
import type { PublicProposalDTO, ProposalFlight, ProposalHotel, ProposalTransfer, ProposalTour, ProposalDay, ProposalPriceLine, ProposalPackageOption, ProposalPaymentMilestone } from './_types'

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

  // Only public statuses
  if (!['proposal', 'approved', 'live'].includes(itin.status)) notFound()

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
    // Deliberately ignored: cost, supplierCost, netRate, markup
  }
  type RawHotel = {
    name?: string; location?: string; checkIn?: string; checkOut?: string
    roomType?: string; nights?: number; mealPlan?: string; images?: string[]
    // Ignored: cost, supplierCost, wholesale_cost
  }
  type RawTransfer = {
    type?: string; from?: string; to?: string; date?: string; vehicle?: string; images?: string[]
  }
  type RawTour = {
    name?: string; location?: string; date?: string; time?: string
    duration?: string; provider?: string; notes?: string; images?: string[]
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

  // GA5: expose approval token only when still valid (proposal, not used, not expired)
  const rawToken = rawOptions.approvalToken
  const approvalToken = (
    itin.status === 'proposal' &&
    typeof rawToken === 'string' &&
    rawToken.length > 0 &&
    !rawOptions.approvalTokenUsed &&
    (!rawOptions.approvalTokenExpiresAt || new Date(rawOptions.approvalTokenExpiresAt) > new Date())
  ) ? rawToken : undefined

  // GA5: parse acceptance snapshot for approved status display
  const rawSnap = safeParse<RawAcceptanceSnapshot>(itin.selectedOption, {})
  const acceptedAt        = itin.status === 'approved' ? rawSnap.acceptedAt : undefined
  const acceptedTotal     = itin.status === 'approved' ? (rawSnap.acceptedTotal ?? null) : undefined
  const acceptedBy        = itin.status === 'approved' ? rawSnap.acceptedBy : undefined
  const acceptedOptionIds = itin.status === 'approved' ? (rawSnap.selectedOptionIds ?? []) : undefined

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
    pnr: f.pnr,
    stops: f.stops,
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
  }))

  const transfers: ProposalTransfer[] = rawTransfers.map(t => ({
    type: t.type,
    from: t.from,
    to: t.to,
    date: t.date,
    vehicle: t.vehicle,
    images: t.images,
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
  }))

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
  }

  return <ProposalPage proposal={dto} />
}
