import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { Resend } from 'resend'

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

// ── GET /api/admin/clients ────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit  = 25

  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { name:  { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: { select: { bookings: true } },
        portalApplications: {
          orderBy: { createdAt: 'desc' },
          include: {
            documents: { select: { id: true, status: true } },
            payments:  { select: { id: true, amount: true, status: true } },
            checklist: { select: { id: true, completedAt: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({ clients: users, total, page, limit })
}

// ── POST /api/admin/clients — create new client (admin-initiated) ──────────
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    name, email, whatsapp, nationality, countryOfResidence,
    service, destination, travelDate, numberOfApplicants, notes,
    sendPortalLink,
  } = body

  if (!email || !name) {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
  }

  const normalised = email.toLowerCase().trim()

  // Check for duplicate
  const existing = await prisma.user.findUnique({ where: { email: normalised } })
  if (existing) {
    return NextResponse.json({ error: 'A client with this email already exists' }, { status: 409 })
  }

  // Generate temporary password
  const tempPassword = crypto.randomBytes(5).toString('hex').toUpperCase() + '#1'
  const hashed = await bcrypt.hash(tempPassword, 12)

  // Create user
  const user = await prisma.user.create({
    data: {
      name:     name.trim(),
      email:    normalised,
      password: hashed,
    },
  })

  // Create portal application for the service requested
  const refNumber = 'WLZ-' + Date.now().toString(36).toUpperCase()

  const APP_TYPE_MAP: Record<string, string> = {
    'UK Visa':          'VISA',
    'Canada Visa':      'VISA',
    'UAE Visa':         'VISA',
    'Schengen Visa':    'VISA',
    'USA Visa':         'VISA',
    'Tour Booking':     'TOUR',
    'Flight Booking':   'FLIGHT',
    'Holiday Package':  'PACKAGE',
    'Group Travel':     'PACKAGE',
  }

  const appType = APP_TYPE_MAP[service] ?? 'OTHER'

  const portalApp = await prisma.portalApplication.create({
    data: {
      userId:      user.id,
      refNumber,
      type:        appType as 'VISA' | 'FLIGHT' | 'HOTEL' | 'TOUR' | 'PACKAGE' | 'OTHER',
      title:       service ?? 'New Application',
      destination: destination ?? null,
      travelDate:  travelDate ?? null,
      notes:       [
        notes,
        whatsapp        ? `WhatsApp: ${whatsapp}` : null,
        nationality     ? `Nationality: ${nationality}` : null,
        countryOfResidence ? `Country of Residence: ${countryOfResidence}` : null,
        numberOfApplicants ? `No. of Applicants: ${numberOfApplicants}` : null,
      ].filter(Boolean).join('\n') || null,
    },
  })

  // Send portal welcome email if requested
  if (sendPortalLink) {
    const resend = getResend()
    const portalUrl = `${process.env.NEXTAUTH_URL ?? 'https://walztravels.com'}/portal/login`

    if (resend) {
      await resend.emails.send({
        from: 'Walz Travels <noreply@walztravels.com>',
        to:   normalised,
        subject: 'Your Walz Travels Client Portal',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <tr><td style="background:linear-gradient(135deg,#0B1F3A,#1C3557);padding:36px 40px 28px;text-align:center;">
    <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="120" style="display:block;margin:0 auto 16px;width:120px;height:auto;" />
    <p style="margin:0;color:#C9A84C;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Your Client Portal</p>
  </td></tr>

  <tr><td style="padding:36px 40px;">
    <p style="margin:0 0 8px;color:#0B1F3A;font-size:18px;font-weight:700;">Welcome, ${name.trim().split(' ')[0]}! 👋</p>
    <p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.8;">
      Your Walz Travels client portal has been set up. You can now track your application,
      upload documents, and view payment status — all in one place.
    </p>

    <div style="background:#F8F9FA;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
      <p style="margin:0 0 12px;color:#0B1F3A;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Your Login Details</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse;">
        <tr>
          <td style="color:#6b7280;padding:5px 0;width:100px;">Email</td>
          <td style="color:#0B1F3A;font-weight:600;">${normalised}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;padding:5px 0;">Password</td>
          <td style="font-family:monospace;color:#0B1F3A;font-weight:700;font-size:16px;letter-spacing:1px;">${tempPassword}</td>
        </tr>
      </table>
      <p style="margin:12px 0 0;color:#9ca3af;font-size:12px;">Please change your password after your first login.</p>
    </div>

    ${service ? `<p style="margin:0 0 16px;color:#4a5568;font-size:14px;">Your <strong>${service}</strong> application${destination ? ` to <strong>${destination}</strong>` : ''} has been created and is ready for you to review.</p>` : ''}

    <div style="text-align:center;margin:0 0 28px;">
      <a href="${portalUrl}"
         style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;padding:16px 36px;border-radius:12px;text-decoration:none;font-size:15px;">
        Access My Portal →
      </a>
    </div>

    <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
      If you have any questions, WhatsApp Jade directly at <strong>+1 786 797 7884</strong>.
    </p>
  </td></tr>

  <tr><td style="background:#0B1F3A;padding:20px 40px;text-align:center;">
    <p style="margin:0;color:#8B9BAE;font-size:12px;">© ${new Date().getFullYear()} Walz Travels. Internal portal — not for forwarding.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
      }).catch(err => console.error('Portal welcome email error:', err))
    }
  }

  return NextResponse.json({ user, portalApplication: portalApp, tempPassword: sendPortalLink ? undefined : tempPassword }, { status: 201 })
}
