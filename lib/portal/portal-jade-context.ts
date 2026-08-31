// lib/portal/portal-jade-context.ts — Release 6.5: Server-side portal context for Jade
// Builds server-authoritative customer context.
// NEVER exposes: supplier costs, margins, passport numbers, rateKeys, admin notes, or other customers' data.

import prisma from '@/lib/db'
import { getCustomerBookingState, getCustomerBookingStateLabel } from './booking-states'
import { buildPrimaryJadeContext } from './jade-context'
import { getTravellerProfileCompleteness } from './traveller-completeness'
import { getPassportExpiryStatus } from './traveller-dto'
import { deriveCustomerActions } from './customer-actions'

// ─── Safe DTO types ────────────────────────────────────────────────────────────

export interface PortalJadeContextTrip {
  id: string
  title: string | null
  destination: string | null
  startDate: string | null
  endDate: string | null
  status: string
  adults: number
  children: number
  infants: number
  itemCount: number
  items: Array<{
    type: string
    title: string
    confirmed: boolean
    location: string | null
    startTime: string | null
  }>
}

export interface PortalJadeContextBooking {
  id: string
  reference: string
  type: string
  state: string
  stateLabel: string
  needsAction: boolean
  totalAmount: number
  currency: string
  route: string | null
}

export interface PortalJadeContextProposal {
  id: string
  referenceNumber: string
  title: string
  destination: string | null
  startDate: string | null
  status: string
  totalPrice: number | null
  currency: string | null
}

export interface PortalJadeContextTraveller {
  displayName: string
  relationship: string
  profileCompleteness: number
  passportStatus: string | null
}

export interface PortalJadeContext {
  customer: { displayName: string; firstName: string }
  focusEntity?: { type: 'trip' | 'booking' | 'proposal'; id: string; label: string }
  activeTrip?: PortalJadeContextTrip
  recentBookings: PortalJadeContextBooking[]
  openProposals: PortalJadeContextProposal[]
  primaryTraveller: { displayName: string; passportStatus: string | null; profileCompleteness: number } | null
  savedTravellers: PortalJadeContextTraveller[]
  unreadNotificationCount: number
  pendingDocumentCount: number
  actionsRequired: Array<{ label: string; description: string; href: string; priority: string }>
}

export interface PortalContextHint {
  tripId?: string
  bookingId?: string
  proposalId?: string
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export async function buildPortalJadeContext(
  userId: string,
  hint?: PortalContextHint,
): Promise<PortalJadeContext> {
  const [
    user,
    trips,
    bookings,
    proposals,
    travellers,
    vault,
    unreadCount,
    pendingDocCount,
    applications,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.trip.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { items: { orderBy: { order: 'asc' }, take: 20 } },
    }),
    prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, bookingReference: true, type: true, status: true,
        paymentStatus: true, totalAmount: true, currency: true, flightDetails: true,
      },
    }),
    prisma.itinerary.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true, referenceNumber: true, title: true, destination: true,
        startDate: true, status: true, totalPrice: true, currency: true,
      },
    }),
    prisma.travellerProfile.findMany({
      where: { userId, isDeleted: false },
      take: 10,
      select: {
        firstName: true, lastName: true, relationship: true,
        dateOfBirth: true, nationality: true, gender: true,
        phone: true, email: true, passportMeta: true,
      },
    }),
    prisma.passportVault.findUnique({
      where: { userId },
      select: {
        givenNames: true, surname: true, dateOfBirth: true, nationality: true,
        sex: true, passportNumber: true, expiryDate: true, phone: true, homeAddress: true,
      },
    }).catch(() => null),
    prisma.portalNotification.count({ where: { userId, read: false } }),
    prisma.portalDocument.count({ where: { userId, status: 'PENDING' } }).catch(() => 0),
    prisma.portalApplication.findMany({
      where: { userId },
      select: { id: true, stage: true, title: true, refNumber: true },
      take: 20,
    }).catch(() => [] as Array<{ id: string; stage: string; title: string; refNumber: string }>),
  ])

  const displayName = user?.name ?? user?.email?.split('@')[0] ?? 'Customer'
  const firstName   = displayName.split(' ')[0]

  // ── Active trip (most recent non-cancelled) ────────────────────────────────
  const activeTripRaw = trips.find(t => t.status !== 'CANCELLED' && t.status !== 'COMPLETED') ?? trips[0] ?? null
  let activeTrip: PortalJadeContextTrip | undefined
  if (activeTripRaw) {
    activeTrip = {
      id:          activeTripRaw.id,
      title:       activeTripRaw.title ?? null,
      destination: activeTripRaw.destination ?? null,
      startDate:   activeTripRaw.startDate?.toISOString().split('T')[0] ?? null,
      endDate:     activeTripRaw.endDate?.toISOString().split('T')[0] ?? null,
      status:      activeTripRaw.status,
      adults:      activeTripRaw.adults,
      children:    activeTripRaw.children,
      infants:     activeTripRaw.infants,
      itemCount:   activeTripRaw.items.length,
      items: activeTripRaw.items.map(item => ({
        type:      item.type,
        title:     item.title,
        confirmed: item.confirmed,
        location:  item.location ?? null,
        startTime: item.startTime ?? null,
      })),
    }
  }

  // ── Bookings ────────────────────────────────────────────────────────────────
  const recentBookings: PortalJadeContextBooking[] = bookings.slice(0, 5).map(b => {
    const state = getCustomerBookingState({ status: b.status, paymentStatus: b.paymentStatus })
    const fd = b.flightDetails && typeof b.flightDetails === 'object'
      ? (b.flightDetails as Record<string, unknown>) : null
    const route = fd ? [fd.origin, fd.destination].filter(Boolean).join(' → ') || null : null
    return {
      id: b.id,
      reference: b.bookingReference ?? b.id,
      type: b.type,
      state,
      stateLabel: getCustomerBookingStateLabel(state),
      needsAction: state === 'ACTION_REQUIRED',
      totalAmount: Number(b.totalAmount),
      currency: b.currency,
      route,
    }
  })

  // ── Proposals ───────────────────────────────────────────────────────────────
  const openProposals: PortalJadeContextProposal[] = proposals.map(p => ({
    id:              p.id,
    referenceNumber: p.referenceNumber,
    title:           p.title,
    destination:     p.destination ?? null,
    startDate:       p.startDate ? new Date(p.startDate).toISOString().split('T')[0] : null,
    status:          p.status,
    totalPrice:      typeof p.totalPrice === 'number' ? p.totalPrice : null,
    currency:        p.currency ?? null,
  }))

  // ── Primary traveller ────────────────────────────────────────────────────────
  let primaryTraveller: PortalJadeContext['primaryTraveller'] = null
  if (vault) {
    const ctx = buildPrimaryJadeContext({ userName: displayName, vault, userPhone: null })
    primaryTraveller = { displayName: ctx.displayName, passportStatus: ctx.passportStatus, profileCompleteness: ctx.profileCompleteness }
  }

  // ── Saved travellers ─────────────────────────────────────────────────────────
  const savedTravellers: PortalJadeContextTraveller[] = travellers.map(t => {
    const pm = t.passportMeta && typeof t.passportMeta === 'object'
      ? (t.passportMeta as Record<string, unknown>) : null
    const completeness = getTravellerProfileCompleteness({
      firstName: t.firstName, lastName: t.lastName, dateOfBirth: t.dateOfBirth,
      nationality: t.nationality, gender: t.gender, phone: t.phone, email: t.email,
      passportMeta: pm ? { maskedNumber: pm.maskedNumber as string ?? null, expiryDate: pm.expiryDate as string ?? null } : null,
    })
    return {
      displayName:         `${t.firstName} ${t.lastName}`.trim(),
      relationship:        t.relationship,
      profileCompleteness: completeness.percent,
      passportStatus:      pm?.expiryDate ? getPassportExpiryStatus(pm.expiryDate as string) : null,
    }
  })

  // ── Actions required ─────────────────────────────────────────────────────────
  const actions = deriveCustomerActions({
    applications: applications.map(a => ({ id: a.id, stage: a.stage, refNumber: a.refNumber ?? '', title: a.title ?? '' })),
    proposals: openProposals.map(p => ({ id: p.id, referenceNumber: p.referenceNumber, title: p.title, status: p.status })),
  })

  // ── Focus entity (hint ownership verified by querying within userId scope) ──
  let focusEntity: PortalJadeContext['focusEntity']
  if (hint?.tripId) {
    const owned = trips.find(t => t.id === hint.tripId)
    if (owned) focusEntity = { type: 'trip', id: owned.id, label: owned.destination ?? owned.title ?? 'Trip' }
  } else if (hint?.bookingId) {
    const owned = bookings.find(b => b.id === hint.bookingId)
    if (owned) focusEntity = { type: 'booking', id: owned.id, label: `${owned.type} ${owned.bookingReference ?? ''}`.trim() }
  } else if (hint?.proposalId) {
    const owned = proposals.find(p => p.id === hint.proposalId)
    if (owned) focusEntity = { type: 'proposal', id: owned.id, label: `Proposal ${owned.referenceNumber}` }
  }

  return {
    customer: { displayName, firstName },
    focusEntity,
    activeTrip,
    recentBookings,
    openProposals,
    primaryTraveller,
    savedTravellers,
    unreadNotificationCount: unreadCount,
    pendingDocumentCount: pendingDocCount,
    actionsRequired: actions.map(a => ({ label: a.label, description: a.description, href: a.href, priority: a.priority })),
  }
}

// ─── System prompt serialiser — delimited to resist prompt injection ───────────

// Strip characters that could escape the <portal_context> XML delimiter block.
// Only applied to customer-supplied strings before injection into the system prompt.
function sanitizeForPortalContext(value: string): string {
  return value.replace(/<\/?portal_context>/gi, '').replace(/[<>]/g, '')
}

export function serializePortalContextForPrompt(ctx: PortalJadeContext): string {
  const displayName = sanitizeForPortalContext(ctx.customer.displayName)
  const lines: string[] = [`Customer: ${displayName}`, '']

  if (ctx.focusEntity) {
    lines.push(`Focused entity: ${ctx.focusEntity.type} — ${sanitizeForPortalContext(ctx.focusEntity.label)}`, '')
  }

  if (ctx.activeTrip) {
    const t = ctx.activeTrip
    const tripLabel = sanitizeForPortalContext(t.destination ?? t.title ?? 'Untitled')
    lines.push(
      `Active trip: ${tripLabel} | Status: ${t.status}`,
      `  Dates: ${t.startDate ?? 'TBD'} – ${t.endDate ?? 'TBD'} | Travellers: ${t.adults} adult${t.adults !== 1 ? 's' : ''}${t.children > 0 ? ` ${t.children} child${t.children !== 1 ? 'ren' : ''}` : ''}${t.infants > 0 ? ` ${t.infants} infant${t.infants !== 1 ? 's' : ''}` : ''}`,
    )
    if (t.items.length > 0) {
      lines.push('  Components:')
      for (const item of t.items) {
        lines.push(`    - [${item.type}] ${item.title}${item.location ? ` (${item.location})` : ''} — ${item.confirmed ? 'confirmed' : 'not confirmed'}`)
      }
    }
    lines.push('')
  }

  if (ctx.recentBookings.length > 0) {
    lines.push('Bookings:')
    for (const b of ctx.recentBookings) {
      const s = `  ${b.type}${b.route ? ` (${b.route})` : ''} | Ref: ${b.reference} | ${b.stateLabel} | ${b.currency} ${b.totalAmount.toFixed(2)}`
      lines.push(b.needsAction ? s + ' [ACTION REQUIRED]' : s)
    }
    lines.push('')
  }

  if (ctx.openProposals.length > 0) {
    lines.push('Proposals:')
    for (const p of ctx.openProposals) {
      lines.push(`  ${p.referenceNumber}: ${p.title} | ${p.destination ?? ''} | Status: ${p.status}${p.totalPrice ? ` | ${p.currency ?? ''} ${p.totalPrice}` : ''}`)
    }
    lines.push('')
  }

  if (ctx.primaryTraveller) {
    const pt = ctx.primaryTraveller
    lines.push(`Primary traveller: ${pt.displayName} | Passport: ${pt.passportStatus ?? 'not provided'} | Profile: ${pt.profileCompleteness}% complete`)
  }

  if (ctx.savedTravellers.length > 0) {
    lines.push('Saved travellers:')
    for (const t of ctx.savedTravellers) {
      lines.push(`  ${t.displayName} (${t.relationship}) | Profile: ${t.profileCompleteness}% | Passport: ${t.passportStatus ?? 'not provided'}`)
    }
    lines.push('')
  }

  if (ctx.actionsRequired.length > 0) {
    lines.push('Actions needed:')
    for (const a of ctx.actionsRequired) {
      lines.push(`  [${a.priority.toUpperCase()}] ${a.label}: ${a.description}`)
    }
    lines.push('')
  }

  const badges: string[] = []
  if (ctx.unreadNotificationCount > 0) badges.push(`${ctx.unreadNotificationCount} unread notification${ctx.unreadNotificationCount !== 1 ? 's' : ''}`)
  if (ctx.pendingDocumentCount > 0) badges.push(`${ctx.pendingDocumentCount} document${ctx.pendingDocumentCount !== 1 ? 's' : ''} pending upload`)
  if (badges.length > 0) lines.push(badges.join(' · '))

  return lines.join('\n')
}
