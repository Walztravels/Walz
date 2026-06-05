import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  const userId = session.user.id
  const email  = session.user.email?.toLowerCase()

  const [
    applications,
    bookings,
    purchasedVouchers,
    receivedVouchers,
    referral,
  ] = await Promise.all([
    // Applications
    prisma.portalApplication.findMany({
      where: { userId },
      include: {
        documents: { select: { id: true, status: true, uploadedAt: true } },
        payments:  { select: { id: true, amount: true, currency: true, status: true, paidAt: true, description: true } },
        checklist: { select: { id: true, completedAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),

    // Bookings (flight, hotel, tour)
    prisma.booking.findMany({
      where: {
        OR: [
          { userId },
          ...(email ? [{ contactEmail: email }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    // Gift vouchers PURCHASED by this user (purchasedByUserId or senderEmail match)
    prisma.voucher.findMany({
      where: {
        voucherKind: 'gift',
        OR: [
          { purchasedByUserId: userId },
          ...(email ? [{ senderEmail: email }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Vouchers RECEIVED by this user (recipientUserId or recipientEmail match)
    prisma.voucher.findMany({
      where: {
        OR: [
          { recipientUserId: userId },
          ...(email ? [{ recipientEmail: email }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Referral code
    prisma.referralCode.findUnique({ where: { userId } }),
  ])

  // Build recent activity (last 10 events)
  const activity: Array<{ type: string; label: string; detail: string; date: Date }> = []

  for (const app of applications) {
    activity.push({
      type:   'application',
      label:  app.title,
      detail: `Stage: ${app.stage.replace(/_/g, ' ')}`,
      date:   app.updatedAt,
    })
    for (const doc of app.documents) {
      activity.push({ type: 'document', label: 'Document uploaded', detail: app.title, date: doc.uploadedAt })
    }
    for (const pay of app.payments) {
      if (pay.paidAt) {
        activity.push({ type: 'payment', label: `Payment of ${pay.currency} ${pay.amount}`, detail: pay.description, date: pay.paidAt })
      }
    }
  }
  for (const b of bookings) {
    activity.push({ type: 'booking', label: `${b.type} booking confirmed`, detail: `Ref: ${b.bookingReference}`, date: b.createdAt })
  }
  activity.sort((a, b) => b.date.getTime() - a.date.getTime())
  const recentActivity = activity.slice(0, 10)

  // Separate credits from gift vouchers received
  const giftVouchers   = receivedVouchers.filter(v => v.voucherKind === 'gift')
  const travelCredits  = receivedVouchers.filter(v => v.voucherKind === 'credit')

  // Stats
  const activeApps     = applications.filter(a => !['APPROVED','REJECTED','COMPLETED'].includes(a.stage)).length
  const upcomingTrips  = bookings.filter(b => b.status === 'CONFIRMED').length
  const unreadDocs     = applications.flatMap(a => a.documents).filter(d => d.status === 'PENDING').length

  return NextResponse.json({
    applications,
    bookings,
    purchasedVouchers,
    giftVouchers,
    travelCredits,
    recentActivity,
    referral,
    stats: {
      activeApplications: activeApps,
      upcomingTrips,
      pendingDocuments: unreadDocs,
    },
  })
}
