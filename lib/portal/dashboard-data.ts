// lib/portal/dashboard-data.ts
// Release 6.2: Server-side aggregator for the unified dashboard.
// Called directly from RSC pages — never expose via HTTP without stripping internal fields.

import prisma from '@/lib/db'

// ── Proposal (Itinerary linked to this user via Release 6.1 userId) ──────────

export interface DashboardProposal {
  id: string
  referenceNumber: string
  title: string
  status: string
  destination: string
  startDate: Date | null
  endDate: Date | null
  totalPrice: number | null
  currency: string
  sentAt: Date | null
  approvedAt: Date | null
  numberOfTravellers: number
  updatedAt: Date
}

// ── Application ───────────────────────────────────────────────────────────────

export interface DashboardApplication {
  id: string
  refNumber: string
  title: string
  stage: string
  destination: string | null
  travelDate: string | null
  amount: number | null
  currency: string
  amountPaid: number
  createdAt: Date
  updatedAt: Date
  documents: { id: string; status: string; uploadedAt: Date }[]
  payments: { id: string; amount: number; currency: string; status: string; paidAt: Date | null; description: string }[]
  checklist: { id: string; completedAt: Date | null }[]
  updates: { id: string; createdAt: Date; title: string; newStatus: string | null }[]
}

// ── Booking ───────────────────────────────────────────────────────────────────

export interface DashboardBooking {
  id: string
  bookingReference: string
  type: string
  status: string
  paymentStatus: string
  totalAmount: number
  currency: string
  flightDetails: Record<string, unknown> | null
  hotelDetails: Record<string, unknown> | null
  createdAt: Date
}

// ── Voucher ───────────────────────────────────────────────────────────────────

export interface DashboardVoucher {
  id: string
  code: string
  currency: string
  remainingAmount: number
  expiresAt: Date
  active: boolean
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface DashboardData {
  proposals: DashboardProposal[]
  applications: DashboardApplication[]
  bookings: DashboardBooking[]
  purchasedVouchers: DashboardVoucher[]
  giftVouchers: DashboardVoucher[]
  travelCredits: DashboardVoucher[]
  referral: { code: string } | null
  stats: {
    pendingProposals: number
    activeApplications: number
    upcomingTrips: number
    pendingDocuments: number
  }
}

// ── Aggregator ────────────────────────────────────────────────────────────────

export async function getDashboardData(userId: string, email: string): Promise<DashboardData> {
  const lowerEmail = email.trim().toLowerCase()

  const [
    proposals,
    applications,
    bookings,
    purchasedVouchers,
    receivedVouchers,
    referral,
  ] = await Promise.all([
    // Proposals — only by userId (Release 6.1). Never match by client-supplied email.
    prisma.itinerary.findMany({
      where: {
        userId,
        status: { not: 'draft' },
      },
      select: {
        id: true, referenceNumber: true, title: true, status: true,
        destination: true, startDate: true, endDate: true,
        totalPrice: true, currency: true, sentAt: true, approvedAt: true,
        numberOfTravellers: true, updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),

    // Applications
    prisma.portalApplication.findMany({
      where: { userId },
      include: {
        documents: { select: { id: true, status: true, uploadedAt: true } },
        payments: { select: { id: true, amount: true, currency: true, status: true, paidAt: true, description: true } },
        checklist: { select: { id: true, completedAt: true } },
        updates: {
          where: { isClientVisible: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, createdAt: true, title: true, newStatus: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),

    // Bookings — userId OR contactEmail fallback (booking may predate portal account)
    prisma.booking.findMany({
      where: {
        OR: [
          { userId },
          ...(lowerEmail ? [{ contactEmail: lowerEmail }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    // Gift vouchers purchased by this user
    prisma.voucher.findMany({
      where: {
        voucherKind: 'gift',
        OR: [
          { purchasedByUserId: userId },
          ...(lowerEmail ? [{ senderEmail: lowerEmail }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Vouchers received by this user
    prisma.voucher.findMany({
      where: {
        OR: [
          { recipientUserId: userId },
          ...(lowerEmail ? [{ recipientEmail: lowerEmail }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Referral code
    prisma.referralCode.findUnique({ where: { userId } }),
  ])

  const giftVouchers  = receivedVouchers.filter(v => v.voucherKind === 'gift')
  const travelCredits = receivedVouchers.filter(v => v.voucherKind === 'credit')

  const pendingProposals  = proposals.filter(p => p.status === 'sent' || p.status === 'viewed').length
  const activeApps        = applications.filter(a => !['APPROVED', 'REJECTED', 'COMPLETED'].includes(a.stage)).length
  const upcomingTrips     = bookings.filter(b => b.status === 'CONFIRMED').length
  const pendingDocuments  = applications.flatMap(a => a.documents).filter(d => d.status === 'PENDING').length

  return {
    proposals:        proposals as unknown as DashboardProposal[],
    applications:     applications as unknown as DashboardApplication[],
    bookings:         bookings as unknown as DashboardBooking[],
    purchasedVouchers: purchasedVouchers as unknown as DashboardVoucher[],
    giftVouchers:     giftVouchers as unknown as DashboardVoucher[],
    travelCredits:    travelCredits as unknown as DashboardVoucher[],
    referral,
    stats: { pendingProposals, activeApplications: activeApps, upcomingTrips, pendingDocuments },
  }
}
