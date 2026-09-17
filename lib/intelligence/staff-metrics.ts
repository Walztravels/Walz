import prisma from '@/lib/db'

/**
 * Staff Intelligence (INT-8) — REAL operational metrics per staff member
 * for one period ('YYYY-MM'). Every number is a count/sum over actual
 * records with its source named; anything without a data source is
 * reported in notComputable and stored as 0, never invented.
 *
 * "Burnout" is deliberately NOT diagnosed — this system never assesses
 * staff health or mental condition. The burnoutRisk column now carries
 * the WORKLOAD INDICATOR: a plain count of observable open work items.
 */

export const STAFF_METRICS_VERSION = 'int8.1'

export interface StaffMetricsPayload {
  version: string
  computedAt: string
  staffId: string
  staffEmail: string
  period: string                      // YYYY-MM
  metrics: {
    bookingsCreated: { value: number; source: string }
    activityBookings: { value: number; source: string }
    quotesCreated: { value: number; source: string }
    quotesAccepted: { value: number; source: string }
    emailsSent: { value: number; source: string }
    callsHandled: { value: number; source: string }
    callMinutes: { value: number; source: string }
    missedCalls: { value: number; source: string }
    visaMessagesSent: { value: number; source: string }
    leadsAssigned: { value: number; source: string }
    applicationsAssigned: { value: number; source: string }
    checkInsPresent: { value: number; source: string }
    checkInsFlagged: { value: number; source: string }
  }
  revenueByCurrency: Record<string, number>   // never summed across currencies
  workloadIndicator: { value: number; basis: string }
  notComputable: string[]
}

export function periodRange(period: string): { start: Date; end: Date } | null {
  const m = period.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))
  const end   = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1))
  return { start, end }
}

export async function computeStaffMetrics(staffId: string, period: string): Promise<StaffMetricsPayload | null> {
  const range = periodRange(period)
  if (!range) return null
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, email: true } })
  if (!staff) return null
  const inPeriod = { gte: range.start, lt: range.end }

  const [bookings, activityBookings, quotes, emailsSent, calls, visaMsgs, leadsAssigned, appsAssigned, checkIns] = await Promise.all([
    prisma.booking.findMany({
      where: { createdByStaffId: staffId, createdAt: inPeriod },
      select: { totalAmount: true, currency: true },
    }).catch(() => []),
    prisma.activityBooking.count({ where: { bookedByStaffId: staffId, createdAt: inPeriod } }).catch(() => 0),
    prisma.quote.findMany({
      where: { createdBy: { equals: staff.email, mode: 'insensitive' }, createdAt: inPeriod },
      select: { acceptedAt: true, convertedAt: true },
    }).catch(() => []),
    prisma.emailMessage.count({ where: { sentBy: staffId, sentAt: inPeriod } }).catch(() => 0),
    prisma.callLog.findMany({
      where: { assignedTo: { equals: staff.email, mode: 'insensitive' }, createdAt: inPeriod },
      select: { duration: true, status: true },
    }).catch(() => []),
    prisma.visaApplicationMessage.count({ where: { sentBy: staffId, createdAt: inPeriod } }).catch(() => 0),
    prisma.lead.count({ where: { assignedToId: staffId } }).catch(() => 0),
    // assignedTo holds a mix of slugs and emails historically — the email
    // match is the honest computable subset (documented limitation).
    prisma.visaApplication.count({
      where: { assignedTo: { equals: staff.email, mode: 'insensitive' }, isDraft: false, createdAt: inPeriod },
    }).catch(() => 0),
    prisma.checkInRecord.findMany({
      where: { staffId, windowStart: inPeriod },
      select: { present: true, flagged: true },
    }).catch(() => []),
  ])

  const revenueByCurrency: Record<string, number> = {}
  for (const b of bookings) {
    if (b.totalAmount == null) continue
    const cur = b.currency ?? 'GBP'
    revenueByCurrency[cur] = Math.round(((revenueByCurrency[cur] ?? 0) + Number(b.totalAmount)) * 100) / 100
  }

  // Workload indicator: observable open items right now (not per period).
  const [openAssignedApps, openQuotes, leadsNeedingFollowUp] = await Promise.all([
    prisma.visaApplication.count({
      where: { assignedTo: { equals: staff.email, mode: 'insensitive' }, isDraft: false, status: { notIn: ['approved', 'refused'] } },
    }).catch(() => 0),
    prisma.quote.count({
      where: { createdBy: { equals: staff.email, mode: 'insensitive' }, status: { in: ['sent', 'viewed'] } },
    }).catch(() => 0),
    prisma.lead.count({
      where: { assignedToId: staffId, nextFollowUpAt: { lte: new Date() } },
    }).catch(() => 0),
  ])
  const workload = openAssignedApps + openQuotes + leadsNeedingFollowUp

  return {
    version: STAFF_METRICS_VERSION,
    computedAt: new Date().toISOString(),
    staffId, staffEmail: staff.email, period,
    metrics: {
      bookingsCreated:      { value: bookings.length, source: 'Booking.createdByStaffId' },
      activityBookings:     { value: activityBookings, source: 'ActivityBooking.bookedByStaffId' },
      quotesCreated:        { value: quotes.length, source: 'Quote.createdBy (staff email)' },
      quotesAccepted:       { value: quotes.filter(q => q.acceptedAt || q.convertedAt).length, source: 'Quote.acceptedAt/convertedAt' },
      emailsSent:           { value: emailsSent, source: 'EmailMessage.sentBy' },
      callsHandled:         { value: calls.length, source: 'CallLog.assignedTo (email)' },
      callMinutes:          { value: Math.round(calls.reduce((s, c) => s + (c.duration ?? 0), 0) / 60), source: 'CallLog.duration' },
      missedCalls:          { value: calls.filter(c => c.status === 'missed').length, source: 'CallLog.status' },
      visaMessagesSent:     { value: visaMsgs, source: 'VisaApplicationMessage.sentBy' },
      leadsAssigned:        { value: leadsAssigned, source: 'Lead.assignedToId' },
      applicationsAssigned: { value: appsAssigned, source: 'VisaApplication.assignedTo (email-matched subset)' },
      checkInsPresent:      { value: checkIns.filter(c => c.present).length, source: 'CheckInRecord.present' },
      checkInsFlagged:      { value: checkIns.filter(c => c.flagged).length, source: 'CheckInRecord.flagged' },
    },
    revenueByCurrency,
    workloadIndicator: {
      value: workload,
      basis: `${openAssignedApps} open assigned applications + ${openQuotes} open quotes + ${leadsNeedingFollowUp} leads due follow-up`,
    },
    notComputable: [
      'avgResponseTimeMin — inbox messages carry no staff attribution on webhook paths',
      'docQualityScore — document reviews record no reviewer',
      'crossSellRate — CommercialEvent has no staffId',
      'revenuePerHour — no hours-worked source (check-ins record presence slots, not duration)',
      'visa approvalRate per staff — VisaApplication.assignedTo mixes slugs and emails; assignedOfficerId is never written',
    ],
  }
}
