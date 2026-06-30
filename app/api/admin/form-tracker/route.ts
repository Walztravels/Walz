import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { ISO2_TO_SLUG } from '@/lib/visa-config'
import { getResend } from '@/lib/resend'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') ?? 'all'
  const search = searchParams.get('search') ?? ''

  const where: Record<string, unknown> = {}

  if (filter === 'not_opened') {
    where.tokens  = { some: {} }
    where.openedAt = null
  } else if (filter === 'opened') {
    where.openedAt  = { not: null }
  } else if (filter === 'started') {
    where.startedAt = { not: null }
  } else if (filter === 'sent') {
    where.tokens = { some: {} }
  } else if (filter === 'not_sent') {
    where.tokens = { none: {} }
  }

  if (search.trim()) {
    where.OR = [
      { firstName:       { contains: search, mode: 'insensitive' } },
      { lastName:        { contains: search, mode: 'insensitive' } },
      { email:           { contains: search, mode: 'insensitive' } },
      { referenceNumber: { contains: search, mode: 'insensitive' } },
    ]
  }

  try {
    const [applications, counts] = await Promise.all([
      prisma.visaApplication.findMany({
        where,
        select: {
          id:              true,
          referenceNumber: true,
          firstName:       true,
          lastName:        true,
          email:           true,
          destinationIso2: true,
          status:          true,
          openedAt:        true,
          startedAt:       true,
          viewCount:       true,
          updatedAt:       true,
          tokens: {
            select: {
              id:          true,
              token:       true,
              clientEmail: true,
              clientName:  true,
              used:        true,
              expiresAt:   true,
              createdAt:   true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      Promise.all([
        prisma.visaApplication.count({ where: { tokens: { some: {} } } }),
        prisma.visaApplication.count({ where: { openedAt: { not: null } } }),
        prisma.visaApplication.count({ where: { startedAt: { not: null } } }),
        prisma.visaApplication.count({ where: { tokens: { some: {} }, openedAt: null } }),
      ]),
    ])
    const [totalSent, totalOpened, totalStarted, totalNotOpened] = counts

    return NextResponse.json({
      applications,
      counts: { totalSent, totalOpened, totalStarted, totalNotOpened },
    })
  } catch (err: any) {
    console.error('[form-tracker GET]:', err.message)
    return NextResponse.json({ error: err.message, applications: [], counts: null }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { applicationId } = await req.json().catch(() => ({})) as { applicationId?: string }
  if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 })

  const app = await prisma.visaApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      destinationIso2: true, visaType: true, referenceNumber: true,
    },
  })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const token = await prisma.visaApplicationToken.create({
    data: {
      applicationId,
      clientEmail: app.email ?? '',
      clientName:  [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant',
      expiresAt:   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })

  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'
  const slug = ISO2_TO_SLUG[app.destinationIso2] ?? app.destinationIso2.toLowerCase()
  const formLink = `${SITE}/visa/apply/${slug}?token=${token.token}&draft=${app.id}`

  try {
        await getResend().emails.send({
      from:    'Walz Travels Visa Team <visa@walztravels.com>',
      to:      token.clientEmail,
      subject: `Your Visa Application Form — ${app.referenceNumber}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0B1F3A;padding:24px;text-align:center">
            <img src="${SITE}/walz-logo.png" width="120" alt="Walz Travels" />
          </div>
          <div style="padding:32px">
            <p style="color:#333;font-size:15px">Hi ${token.clientName},</p>
            <p style="color:#333;font-size:14px">
              Please complete your visa application form using the button below.
            </p>
            ${app.destinationIso2 ? `
            <p style="color:#666;font-size:13px;background:#f5f0e8;padding:12px;border-radius:8px">
              <strong>Reference:</strong> ${app.referenceNumber} &nbsp;·&nbsp;
              <strong>Destination:</strong> ${app.destinationIso2}
            </p>` : ''}
            <div style="text-align:center;margin:28px 0">
              <a href="${formLink}" style="background:#C9A84C;color:#0B1F3A;
                font-weight:bold;padding:14px 32px;border-radius:12px;
                text-decoration:none;display:inline-block;font-size:15px">
                Complete Application →
              </a>
            </div>
            <p style="color:#888;font-size:12px">
              This link expires in 30 days.<br/>
              Need help? <a href="https://wa.me/447398753797" style="color:#C9A84C">WhatsApp: +44 7398 753797</a>
            </p>
          </div>
          <div style="background:#f5f5f5;padding:16px;text-align:center">
            <p style="color:#999;font-size:11px;margin:0">© Walz Travels · walztravels.com</p>
          </div>
        </div>
      `,
    })
  } catch (err) {
    console.error('[FormTracker] Email failed:', err)
  }

  await prisma.activityLog.create({
    data: {
      staffId:    session.id,
      staffName:  session.name,
      staffRole:  session.role,
      action:     'form_link_resent',
      module:     'visa',
      entityId:   app.id,
      entityType: 'visa_application',
      detail:     `Form link sent to ${app.email} (ref: ${app.referenceNumber})`,
    },
  }).catch(() => {})

  return NextResponse.json({ token, formLink }, { status: 201 })
}
