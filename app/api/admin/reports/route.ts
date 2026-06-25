import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getStaffPermissionsByEmail } from '@/lib/getStaffPermissions'
import prisma from '@/lib/db'
import { Resend } from 'resend'

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtDateTime(d: Date) {
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
}

// ── Notify logic ──────────────────────────────────────────────────────────────
function buildNotifyList(reportType: string, staffName: string): string[] {
  const contact      = 'contact@walztravels.com'
  const reservations = 'reservations@walztravels.com'
  const joseph       = 'joseph@walztravels.com'
  const info         = 'info@walztravels.com'

  const nameL = staffName.toLowerCase()
  const isGlory    = nameL.includes('glory')
  const isBoluOrP  = nameL.includes('bolu') || nameL.includes('priscilla')

  let list: string[]

  if (reportType === 'Daily Activity Report') {
    list = [contact, joseph, info]
  } else {
    list = [contact, reservations, joseph, info]
  }

  // Glory never gets reservations in her own reports
  if (isGlory) list = list.filter(e => e !== reservations)

  // Bolu / Priscilla always include reservations
  if (isBoluOrP && !list.includes(reservations)) list.push(reservations)

  return list
}

function buildSubject(reportType: string, staffName: string, periodFrom: string): string {
  const dateStr = fmtDate(periodFrom)
  const isUrgent = reportType === 'Issue or Complaint Report'
  if (isUrgent) return `URGENT — ${staffName} Issue Report`
  const labels: Record<string, string> = {
    'Daily Activity Report':      `${staffName} Daily Report — ${dateStr}`,
    'Weekly Summary Report':      `${staffName} Weekly Summary — ${dateStr}`,
    'Monthly Performance Report': `${staffName} Monthly Report — ${dateStr}`,
    'Client Feedback Report':     `${staffName} Client Feedback — ${dateStr}`,
    'Custom Report':              `${staffName} Report — ${dateStr}`,
  }
  return labels[reportType] ?? `${staffName} Report — ${dateStr}`
}

function buildEmailHtml(r: {
  staffName: string; staffRole?: string | null; reportType: string
  periodFrom: string | Date; periodTo: string | Date; summary?: string | null
  clientsContacted: number; followUps: number; depositsCollected: number; applicationsSubmitted: number
  visaReceived: number; visaSubmitted: number; approvals: number; refusals: number; pendingApplications: number
  flightBookings: number; hotelBookings: number; tourBookings: number
  totalRevenue: number; revenueCurrency: string
  issuesChallenges?: string | null; nextPeriodGoals?: string | null; additionalNotes?: string | null
  createdAt: Date
}) {
  const row = (label: string, val: string | number) =>
    `<tr><td style="color:#6b7280;padding:5px 0;width:200px;font-size:13px;">${label}</td><td style="color:#0B1F3A;font-weight:600;font-size:13px;">${val}</td></tr>`

  const section = (title: string, content: string) =>
    `<div style="margin:20px 0;"><p style="margin:0 0 6px;color:#0B1F3A;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">${title}</p>${content}</div>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:24px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

  <tr><td style="background:#0B1F3A;padding:24px 32px;">
    <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="80" style="display:block;margin:0 0 12px;width:80px;height:auto;" />
    <h1 style="margin:0;color:#C9A84C;font-size:18px;font-weight:700;">Staff Report</h1>
    <p style="margin:4px 0 0;color:#8B9BAE;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;">${r.reportType}</p>
  </td></tr>

  <tr><td style="padding:28px 32px 0;">

    ${section('Staff Information', `<table style="width:100%;border-collapse:collapse;">
      ${row('Staff Member', r.staffName)}
      ${row('Role', r.staffRole ?? '—')}
      ${row('Report Type', r.reportType)}
      ${row('Period', `${fmtDate(r.periodFrom)} — ${fmtDate(r.periodTo)}`)}
      ${row('Submitted', fmtDateTime(r.createdAt))}
    </table>`)}

    ${r.summary ? section('Summary', `<p style="margin:0;color:#374151;font-size:13px;line-height:1.7;white-space:pre-wrap;">${r.summary}</p>`) : ''}

    ${section('Client Activity', `<table style="width:100%;border-collapse:collapse;">
      ${row('Clients Contacted', r.clientsContacted)}
      ${row('Follow Ups Completed', r.followUps)}
      ${row('Deposits Collected', r.depositsCollected)}
      ${row('Applications Submitted', r.applicationsSubmitted)}
    </table>`)}

    ${section('Visa Applications', `<table style="width:100%;border-collapse:collapse;">
      ${row('Applications Received', r.visaReceived)}
      ${row('Submitted to Embassy', r.visaSubmitted)}
      ${row('Approvals', r.approvals)}
      ${row('Refusals', r.refusals)}
      ${row('Currently Pending', r.pendingApplications)}
    </table>`)}

    ${section('Bookings', `<table style="width:100%;border-collapse:collapse;">
      ${row('Flight Bookings', r.flightBookings)}
      ${row('Hotel Bookings', r.hotelBookings)}
      ${row('Tour Bookings', r.tourBookings)}
      ${row('Total Revenue', `${r.revenueCurrency} ${r.totalRevenue.toLocaleString()}`)}
    </table>`)}

    ${r.issuesChallenges ? section('Issues &amp; Challenges', `<p style="margin:0;color:#374151;font-size:13px;line-height:1.7;white-space:pre-wrap;">${r.issuesChallenges}</p>`) : ''}
    ${r.nextPeriodGoals  ? section('Goals for Next Period', `<p style="margin:0;color:#374151;font-size:13px;line-height:1.7;white-space:pre-wrap;">${r.nextPeriodGoals}</p>`)  : ''}
    ${r.additionalNotes  ? section('Additional Notes',      `<p style="margin:0;color:#374151;font-size:13px;line-height:1.7;white-space:pre-wrap;">${r.additionalNotes}</p>`)      : ''}

    <div style="margin:24px 0;text-align:center;">
      <a href="https://walztravels.com/admin/reports/all"
         style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;">
        View All Reports →
      </a>
    </div>

  </td></tr>

  <tr><td style="background:#0B1F3A;padding:16px 32px;text-align:center;margin-top:8px;">
    <p style="margin:0;color:#8B9BAE;font-size:11px;">© ${new Date().getFullYear()} Walz Travels — Internal Staff Report</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// ── GET /api/admin/reports ────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page      = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit     = Math.min(50, parseInt(searchParams.get('limit') ?? '25'))
  const staffEmail = searchParams.get('staffEmail')
  const type      = searchParams.get('type')
  const dateFrom  = searchParams.get('dateFrom')
  const dateTo    = searchParams.get('dateTo')
  const reviewed  = searchParams.get('reviewed')
  const ownOnly   = searchParams.get('ownOnly') === 'true'

  const where: Record<string, unknown> = {}
  if (ownOnly)   where.staffEmail = session.email
  else if (staffEmail) where.staffEmail = staffEmail
  if (type)      where.reportType = type
  if (reviewed === 'true')  where.reviewedByAdmin = true
  if (reviewed === 'false') where.reviewedByAdmin = false
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
    }
  }

  const [reports, total] = await Promise.all([
    prisma.staffReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.staffReport.count({ where }),
  ])

  return NextResponse.json({ reports, total, page, limit })
}

// ── POST /api/admin/reports ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check reports_submit or reports_all permission (merges role defaults + staff overrides)
  const perms = await getStaffPermissionsByEmail(session.email)
  if (!perms.reports_submit && !perms.reports_all) {
    return NextResponse.json(
      { error: 'You do not have permission to submit reports. Contact your administrator.' },
      { status: 403 }
    )
  }

  const body = await req.json()
  const { reportType, periodFrom, periodTo, summary } = body

  if (!reportType || !periodFrom || !periodTo) {
    return NextResponse.json({ error: 'reportType, periodFrom, periodTo are required' }, { status: 400 })
  }

  // Get full staff details from DB if available
  const staffMember = await prisma.staff.findUnique({ where: { email: session.email } })
  const staffName   = staffMember?.name ?? session.email.split('@')[0]
  const staffRole   = staffMember?.accessLevel ?? 'Admin'

  const notifyEmails = buildNotifyList(reportType, staffName)

  const report = await prisma.staffReport.create({
    data: {
      staffId:              staffMember?.id ?? null,
      staffName,
      staffEmail:           session.email,
      staffRole,
      reportType,
      periodFrom:           new Date(periodFrom),
      periodTo:             new Date(periodTo),
      summary:              body.summary ?? null,
      clientsContacted:     Number(body.clientsContacted   ?? 0),
      followUps:            Number(body.followUps          ?? 0),
      depositsCollected:    Number(body.depositsCollected  ?? 0),
      applicationsSubmitted: Number(body.applicationsSubmitted ?? 0),
      visaReceived:         Number(body.visaReceived       ?? 0),
      visaSubmitted:        Number(body.visaSubmitted      ?? 0),
      approvals:            Number(body.approvals          ?? 0),
      refusals:             Number(body.refusals           ?? 0),
      pendingApplications:  Number(body.pendingApplications ?? 0),
      flightBookings:       Number(body.flightBookings     ?? 0),
      hotelBookings:        Number(body.hotelBookings      ?? 0),
      tourBookings:         Number(body.tourBookings       ?? 0),
      totalRevenue:         Number(body.totalRevenue       ?? 0),
      revenueCurrency:      body.revenueCurrency ?? 'USD',
      issuesChallenges:     body.issuesChallenges  ?? null,
      nextPeriodGoals:      body.nextPeriodGoals   ?? null,
      additionalNotes:      body.additionalNotes   ?? null,
      notifyEmails,
    },
  })

  // Log activity
  await prisma.activityLog.create({
    data: {
      staffId:   staffMember?.id ?? null,
      staffName,
      action:    'Report Submitted',
      detail:    `${staffName} submitted a ${reportType}`,
    },
  }).catch(() => {})

  // Send email notifications
  const resend = getResend()
  if (resend) {
    const subject = buildSubject(reportType, staffName, periodFrom)
    const html    = buildEmailHtml({ ...report, createdAt: new Date() })
    await Promise.all(
      notifyEmails.map(to =>
        resend.emails.send({ from: 'Walz Travels <noreply@walztravels.com>', to, subject, html })
          .catch(e => console.error(`Report email to ${to} failed:`, e))
      )
    )
  }

  return NextResponse.json({ report }, { status: 201 })
}

// ── PATCH /api/admin/reports — mark as reviewed ───────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, adminComment } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const staffMember = await prisma.staff.findUnique({ where: { email: session.email } })
  const reviewerName = staffMember?.name ?? session.email

  const updated = await prisma.staffReport.update({
    where: { id },
    data: {
      reviewedByAdmin: true,
      reviewedAt:      new Date(),
      reviewedBy:      reviewerName,
      ...(adminComment ? { additionalNotes: adminComment } : {}),
    },
  })

  return NextResponse.json({ report: updated })
}
