import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signAdminToken, COOKIE_NAME } from '@/lib/admin-auth'
import { z } from 'zod'
import prisma from '@/lib/db'
import { Resend } from 'resend'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const ALLOWED_EMAILS = (process.env.ADMIN_EMAILS ?? 'contact@walztravels.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

function parseUserAgent(ua: string): { browser: string; operatingSystem: string } {
  let browser = 'Unknown'
  let operatingSystem = 'Unknown'

  // Browser detection
  if (/Edg\//.test(ua))             browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua))  browser = 'Opera'
  else if (/Chrome\//.test(ua))     browser = 'Chrome'
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'
  else if (/Firefox\//.test(ua))    browser = 'Firefox'
  else if (/MSIE|Trident/.test(ua)) browser = 'Internet Explorer'

  // OS detection
  if (/Windows NT 10/.test(ua))     operatingSystem = 'Windows 11/10'
  else if (/Windows NT 6\.3/.test(ua)) operatingSystem = 'Windows 8.1'
  else if (/Windows NT 6\.1/.test(ua)) operatingSystem = 'Windows 7'
  else if (/Windows/.test(ua))      operatingSystem = 'Windows'
  else if (/iPhone/.test(ua))       operatingSystem = 'iOS (iPhone)'
  else if (/iPad/.test(ua))         operatingSystem = 'iOS (iPad)'
  else if (/Mac OS X/.test(ua))     operatingSystem = 'macOS'
  else if (/Android/.test(ua))      operatingSystem = 'Android'
  else if (/Linux/.test(ua))        operatingSystem = 'Linux'

  return { browser, operatingSystem }
}

function fmtDateTime(d: Date) {
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZoneName: 'short',
  })
}

function buildLoginAlertHtml(staffName: string, staffRole: string, email: string, ip: string, browser: string, os: string, loginAt: Date) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:24px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

  <tr><td style="background:#0B1F3A;padding:24px 32px;">
    <img src="https://walztravels.us/walz-logo.png" alt="Walz Travels" width="70" style="display:block;margin:0 0 12px;" />
    <h1 style="margin:0;color:#C9A84C;font-size:17px;font-weight:700;">Staff Login Alert</h1>
    <p style="margin:4px 0 0;color:#8B9BAE;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;">Security Notification</p>
  </td></tr>

  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
      A staff member has signed in to the Walz Travels admin panel.
    </p>

    <table style="width:100%;border-collapse:collapse;background:#F8F9FA;border-radius:8px;overflow:hidden;">
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;width:140px;">Staff Member</td>
        <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-weight:700;">${staffName}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Role</td>
        <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${staffRole}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Email</td>
        <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${email}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Login Time</td>
        <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${fmtDateTime(loginAt)}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">IP Address</td>
        <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;font-family:monospace;">${ip || '—'}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Browser</td>
        <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${browser}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;">Device / OS</td>
        <td style="padding:10px 16px;color:#0B1F3A;font-size:13px;">${os}</td>
      </tr>
    </table>

    <div style="margin:24px 0;text-align:center;">
      <a href="https://walztravels.us/admin/activity"
         style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:13px;">
        View Activity Log →
      </a>
    </div>

    <p style="margin:0;color:#9CA3AF;font-size:11px;text-align:center;">
      If this login was not expected, please contact the administrator immediately.
    </p>
  </td></tr>

  <tr><td style="background:#0B1F3A;padding:14px 32px;text-align:center;">
    <p style="margin:0;color:#8B9BAE;font-size:11px;">© ${new Date().getFullYear()} Walz Travels — Internal Security Alert</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// Roles that should NOT trigger a login alert email
const SILENT_ROLES = ['Admin', 'admin', 'ADMIN']

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 })
  }

  const { email, password } = parsed.data
  const normalizedEmail = email.toLowerCase()

  // Extract request metadata
  const ua        = req.headers.get('user-agent') ?? ''
  const ipRaw     = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? ''
  const ipAddress = ipRaw.split(',')[0].trim()
  const { browser, operatingSystem } = parseUserAgent(ua)
  const loginAt = new Date()

  // ── 1. Check Staff table (database accounts) ─────────────────────────────
  const staffMember = await prisma.staff.findUnique({ where: { email: normalizedEmail } })
  if (staffMember) {
    if (!staffMember.isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated. Contact your administrator.' },
        { status: 403 }
      )
    }

    const valid = await bcrypt.compare(password, staffMember.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const staffName = staffMember.name
    const staffRole = staffMember.accessLevel

    // Update last login timestamp
    await prisma.staff.update({
      where: { id: staffMember.id },
      data:  { lastLoginAt: new Date() },
    })

    // Log to StaffLoginLog
    await prisma.staffLoginLog.create({
      data: {
        staffId:         staffMember.id,
        staffName,
        staffEmail:      normalizedEmail,
        staffRole,
        ipAddress,
        userAgent:       ua,
        browser,
        operatingSystem,
        loginAt,
      },
    }).catch((e: unknown) => console.error('StaffLoginLog create failed:', e))

    // Log to ActivityLog
    await prisma.activityLog.create({
      data: {
        staffId:   staffMember.id,
        staffName,
        action:    'Staff Login',
        detail:    `${staffName} signed in (${staffRole})${ipAddress ? ` from ${ipAddress}` : ''}`,
      },
    }).catch((e: unknown) => console.error('ActivityLog create failed:', e))

    // Send login alert — skip for Admin role
    if (!SILENT_ROLES.includes(staffRole)) {
      const resend = getResend()
      if (resend) {
        const subject = `Staff Login Alert — ${staffName} — ${fmtDateTime(loginAt)}`
        const html    = buildLoginAlertHtml(staffName, staffRole, normalizedEmail, ipAddress, browser, operatingSystem, loginAt)
        await Promise.all([
          resend.emails.send({
            from:    'Walz Travels <noreply@walztravels.com>',
            to:      'contact@walztravels.com',
            subject,
            html,
          }).catch(e => console.error('Login alert to contact failed:', e)),
          resend.emails.send({
            from:    'Walz Travels <noreply@walztravels.com>',
            to:      'joseph@walztravels.com',
            subject,
            html,
          }).catch(e => console.error('Login alert to joseph failed:', e)),
        ])
      }
    }

    const token = await signAdminToken(normalizedEmail, staffMember.role, staffMember.id)
    const response = NextResponse.json({
      success:     true,
      email:       normalizedEmail,
      staffName,
      accessLevel: staffRole,
      role:        staffMember.role,
    })
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   60 * 60 * 12,
    })
    return response
  }

  // ── 2. Fall back to env-var super-admin ───────────────────────────────────
  if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const adminPassword     = process.env.ADMIN_PASSWORD ?? ''
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? ''

  let passwordValid = false
  if (adminPasswordHash) {
    passwordValid = await bcrypt.compare(password, adminPasswordHash)
  } else if (adminPassword) {
    passwordValid = password === adminPassword
  }

  if (!passwordValid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Log super-admin login (env-var account = Admin role → no alert email)
  await prisma.staffLoginLog.create({
    data: {
      staffId:         null,
      staffName:       normalizedEmail.split('@')[0],
      staffEmail:      normalizedEmail,
      staffRole:       'Admin',
      ipAddress,
      userAgent:       ua,
      browser,
      operatingSystem,
      loginAt,
    },
  }).catch((e: unknown) => console.error('StaffLoginLog create (env admin) failed:', e))

  await prisma.activityLog.create({
    data: {
      staffId:   null,
      staffName: normalizedEmail.split('@')[0],
      action:    'Staff Login',
      detail:    `Admin signed in via env credentials${ipAddress ? ` from ${ipAddress}` : ''}`,
    },
  }).catch((e: unknown) => console.error('ActivityLog create (env admin) failed:', e))

  const token = await signAdminToken(normalizedEmail)
  const response = NextResponse.json({ success: true, email: normalizedEmail })
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   60 * 60 * 12,
  })
  return response
}
