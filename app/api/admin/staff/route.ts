import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Resend } from 'resend'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_ROLES = ['super_admin', 'general_manager', 'senior_manager', 'coordinator', 'sales_rep']

const ROLE_LABELS: Record<string, string> = {
  super_admin:     'Super Admin',
  general_manager: 'General Manager',
  senior_manager:  'Senior Manager',
  coordinator:     'Coordinator',
  sales_rep:       'Sales Representative',
}

/** Legacy accessLevel derived from role — used by login alert email */
const ROLE_TO_ACCESS: Record<string, string> = {
  super_admin:     'Admin',
  general_manager: 'Manager',
  senior_manager:  'Manager',
  coordinator:     'Coordinator',
  sales_rep:       'Sales',
}

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

function buildWelcomeEmail(
  name: string,
  email: string,
  roleKey: string,
  tempPassword: string,
  portalAccess: boolean,
): string {
  const roleLabel = ROLE_LABELS[roleKey] ?? roleKey
  const adminUrl  = process.env.NEXTAUTH_URL ?? 'https://www.walztravels.com'
  const portalUrl = `${adminUrl}/portal`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:#0B1F3A;padding:28px 36px;">
    <img src="https://www.walztravels.com/walz-logo.png" alt="Walz Travels" width="80" style="display:block;margin:0 0 14px;width:80px;height:auto;" />
    <h1 style="margin:0;color:#C9A84C;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Welcome to the Team</h1>
    <p style="margin:4px 0 0;color:#8B9BAE;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;">Walz Travels Admin Access</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 36px;">
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      Hi <strong>${name}</strong>, your admin account has been created.
      Here are your login details:
    </p>

    <table style="width:100%;border-collapse:collapse;background:#F8F9FA;border-radius:10px;overflow:hidden;margin-bottom:28px;">
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:11px 18px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:150px;">Name</td>
        <td style="padding:11px 18px;color:#0B1F3A;font-size:13px;font-weight:600;">${name}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:11px 18px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Email</td>
        <td style="padding:11px 18px;color:#0B1F3A;font-size:13px;">${email}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:11px 18px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Role</td>
        <td style="padding:11px 18px;color:#0B1F3A;font-size:13px;font-weight:600;">${roleLabel}</td>
      </tr>
      <tr${portalAccess ? ' style="border-bottom:1px solid #E5E7EB;"' : ''}>
        <td style="padding:11px 18px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Temp Password</td>
        <td style="padding:11px 18px;color:#0B1F3A;font-size:13px;font-family:monospace;letter-spacing:0.5px;">${tempPassword}</td>
      </tr>
      ${portalAccess ? `<tr>
        <td style="padding:11px 18px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Portal Access</td>
        <td style="padding:11px 18px;"><span style="background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">Enabled</span></td>
      </tr>` : ''}
    </table>

    <p style="margin:0 0 6px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Admin Panel</p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:${portalAccess ? '24px' : '0'};">
      <tr><td style="border-radius:10px;background:#0B1F3A;">
        <a href="${adminUrl}/admin" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">
          Sign In to Admin Panel →
        </a>
      </td></tr>
    </table>

    ${portalAccess ? `
    <p style="margin:0 0 6px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Client Portal</p>
    <table cellpadding="0" cellspacing="0">
      <tr><td style="border-radius:10px;">
        <a href="${portalUrl}" style="display:inline-block;background:#0B1F3A;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">
          Sign In to Portal →
        </a>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;color:#9CA3AF;font-size:12px;">Use the same email and temporary password for portal access.</p>
    ` : ''}
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0B1F3A;padding:16px 36px;text-align:center;">
    <p style="margin:0;color:#8B9BAE;font-size:11px;">
      Please change your password after your first login.<br/>
      © ${new Date().getFullYear()} Walz Travels · Internal Account
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// ── GET — list all staff ──────────────────────────────────────────────────────
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const staff = await prisma.staff.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true, name: true, email: true, roleTitle: true,
      role: true, portalAccess: true, isActive: true,
      lastLoginAt: true, createdAt: true,
    },
  })

  return NextResponse.json({ staff })
}

// ── POST — create staff member ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { name, email, roleTitle, role, portalAccess, password } =
    body as Record<string, string | boolean>

  if (!name || !email || !roleTitle || !role || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  const roleStr = String(role)
  if (!VALID_ROLES.includes(roleStr) || roleStr === 'super_admin') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  if (String(password).length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const existing = await prisma.staff.findUnique({
    where: { email: String(email).toLowerCase().trim() },
  })
  if (existing) {
    return NextResponse.json({ error: 'A staff member with this email already exists' }, { status: 409 })
  }

  const passwordHash  = await bcrypt.hash(String(password), 12)
  const accessLevel   = ROLE_TO_ACCESS[roleStr] ?? 'Sales'
  const hasPortal     = Boolean(portalAccess)

  const staff = await prisma.staff.create({
    data: {
      name:         String(name).trim(),
      email:        String(email).toLowerCase().trim(),
      passwordHash,
      roleTitle:    String(roleTitle).trim(),
      role:         roleStr,
      accessLevel,
      portalAccess: hasPortal,
      isActive:     true,
    },
    select: {
      id: true, name: true, email: true, roleTitle: true,
      role: true, portalAccess: true, isActive: true, createdAt: true,
    },
  })

  // Activity log
  await prisma.activityLog.create({
    data: {
      action: 'staff_created',
      detail: `${staff.name} (${staff.email}) added as ${ROLE_LABELS[roleStr]}`,
    },
  }).catch(() => {})

  // Welcome email
  const resend = getResend()
  if (resend) {
    const html = buildWelcomeEmail(
      staff.name,
      staff.email,
      roleStr,
      String(password),
      hasPortal,
    )
    await resend.emails.send({
      from:    'Walz Travels <noreply@walztravels.com>',
      to:      staff.email,
      subject: `Welcome to Walz Travels — ${staff.name}`,
      html,
    }).catch((e: unknown) => console.error('Welcome email failed:', e))
  }

  return NextResponse.json({ staff }, { status: 201 })
}
