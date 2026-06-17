import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

const resend = new Resend(process.env.RESEND_API_KEY)
const SITE   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')  // 'not_sent' | 'sent' | 'opened' | 'started'
  const search  = searchParams.get('search')  ?? ''
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit   = 50

  const apps = await prisma.visaApplication.findMany({
    where: {
      ...(search && {
        OR: [
          { clientName:   { contains: search, mode: 'insensitive' } },
          { clientEmail:  { contains: search, mode: 'insensitive' } },
          { referenceNo:  { contains: search, mode: 'insensitive' } },
          { destination:  { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    include: {
      tokens: {
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Annotate each app with its form-tracking status
  const annotated = apps.map(app => {
    const tokens = app.tokens ?? []
    const latest = tokens[0] ?? null

    let formStatus: 'not_sent' | 'sent' | 'opened' | 'started'
    if (!latest) {
      formStatus = 'not_sent'
    } else if (latest.used) {
      formStatus = 'started'
    } else {
      formStatus = 'sent'
    }

    return {
      id:          app.id,
      clientName:  app.clientName,
      clientEmail: app.clientEmail,
      referenceNo: app.referenceNo,
      destination: app.destination,
      status:      app.status,
      createdAt:   app.createdAt,
      formStatus,
      latestToken: latest ? {
        id:        latest.id,
        token:     latest.token,
        used:      latest.used,
        expiresAt: latest.expiresAt,
        createdAt: latest.createdAt,
      } : null,
      tokenHistory: tokens.map(t => ({
        id:        t.id,
        token:     t.token,
        used:      t.used,
        expiresAt: t.expiresAt,
        createdAt: t.createdAt,
      })),
    }
  })

  // Filter by status after annotation
  const filtered = status
    ? annotated.filter(a => a.formStatus === status)
    : annotated

  const total  = filtered.length
  const offset = (page - 1) * limit
  const items  = filtered.slice(offset, offset + limit)

  const stats = {
    totalSent:      annotated.filter(a => a.formStatus !== 'not_sent').length,
    totalNotSent:   annotated.filter(a => a.formStatus === 'not_sent').length,
    totalStarted:   annotated.filter(a => a.formStatus === 'started').length,
    totalIgnored:   annotated.filter(a => a.formStatus === 'sent').length,
  }

  return NextResponse.json({ items, total, page, stats })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    applicationId: string
    resend?:       boolean
  }

  if (!body.applicationId) {
    return NextResponse.json({ error: 'applicationId required' }, { status: 400 })
  }

  const app = await prisma.visaApplication.findUnique({
    where: { id: body.applicationId },
    include: { tokens: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  // Create a new token (expire in 30 days)
  const token = await prisma.visaApplicationToken.create({
    data: {
      applicationId: app.id,
      clientEmail:   app.clientEmail,
      clientName:    app.clientName,
      expiresAt:     new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })

  const formLink = `${SITE}/visa-form/${token.token}`

  const isResend = body.resend && (app.tokens?.length ?? 0) > 0

  await resend.emails.send({
    from:    'Walz Travels Visa Team <visa@walztravels.com>',
    to:      app.clientEmail,
    subject: isResend
      ? `Reminder: Complete your visa application form — ${app.referenceNo ?? 'Your Application'}`
      : `Complete your visa application form — ${app.referenceNo ?? 'Your Application'}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#0B1F3A;padding:32px;text-align:center">
          <img src="${SITE}/walz-logo.png" width="120" alt="Walz Travels" />
        </div>
        <div style="padding:32px;background:#ffffff">
          <h2 style="color:#0B1F3A;margin:0 0 12px">
            ${isResend ? 'Reminder: Your Visa Application Form' : 'Visa Application Form'}
          </h2>
          <p style="color:#444;font-size:14px;margin:0 0 16px">
            Hi ${app.clientName},<br/><br/>
            ${isResend
              ? "We noticed you haven't completed your visa application form yet. Please take a few minutes to fill it in so we can process your application."
              : 'Your visa application is underway! Please complete the form below so we can gather all the information we need to process your application.'
            }
          </p>
          ${app.destination ? `
          <div style="background:#f5f0e8;border-radius:8px;padding:14px 16px;margin-bottom:20px">
            <p style="color:#0B1F3A;font-size:13px;margin:0">
              <strong>Destination:</strong> ${app.destination}
              ${app.referenceNo ? ` &nbsp;·&nbsp; <strong>Ref:</strong> ${app.referenceNo}` : ''}
            </p>
          </div>` : ''}
          <div style="text-align:center;margin:28px 0">
            <a href="${formLink}"
              style="background:#C9A84C;color:#0B1F3A;font-weight:bold;padding:14px 36px;
                border-radius:12px;text-decoration:none;display:inline-block;font-size:16px">
              ✏️ Complete Application Form
            </a>
          </div>
          <p style="color:#888;font-size:12px;text-align:center">
            This link expires in 30 days. Need help?
            <a href="https://wa.me/447398753797" style="color:#C9A84C">WhatsApp: +44 7398 753797</a>
          </p>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center">
          <p style="color:#999;font-size:11px;margin:0">© Walz Travels · walztravels.com</p>
        </div>
      </div>
    `,
  })

  await prisma.activityLog.create({
    data: {
      staffId:    session.id,
      staffName:  session.name,
      staffRole:  session.role,
      action:     isResend ? 'form_link_resent' : 'form_link_sent',
      module:     'visa',
      entityId:   app.id,
      entityType: 'visa_application',
      detail:     `Form link ${isResend ? 'resent' : 'sent'} to ${app.clientEmail}`,
    },
  }).catch(() => {})

  return NextResponse.json({ token, formLink }, { status: 201 })
}
