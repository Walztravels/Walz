import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getStaffPermissionsByEmail } from '@/lib/getStaffPermissions'
import { ROLE_LABELS, ROLE_COLORS, ROLE_BG_CLASSES, EMPTY_PERMISSIONS } from '@/lib/permissions'
import { prisma } from '@/lib/db'

const ALLOWED_EMAILS = (process.env.ADMIN_EMAILS ?? 'contact@walztravels.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())

/**
 * GET /api/admin/me
 * Returns the current admin staff member's profile + merged permissions.
 * Used by the useStaffPermissions() hook on the client.
 *
 * Falls back to full super_admin permissions if the email is in ADMIN_EMAILS
 * but has no Staff record yet (env-var bootstrap scenario).
 */
export async function GET() {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const staff = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: {
      id:         true,
      name:       true,
      email:      true,
      role:       true,
      roleTitle:  true,
      isActive:   true,
    },
  })

  // ── Fallback: env-var super admin with no Staff record yet ────────────────
  if (!staff) {
    if (!ALLOWED_EMAILS.includes(session.email.toLowerCase())) {
      return NextResponse.json({ error: 'Account not found' }, { status: 403 })
    }

    // Grant full super_admin permissions from the RolePermission table
    const roleRecord = await prisma.rolePermission.findUnique({
      where:  { role: 'super_admin' },
      select: { permissions: true },
    })
    const permissions = roleRecord?.permissions ?? EMPTY_PERMISSIONS

    return NextResponse.json({
      id:        'env-admin',
      name:      session.email.split('@')[0],
      email:     session.email,
      role:      'super_admin',
      roleTitle: 'Super Administrator',
      roleLabel: 'Super Admin',
      roleColor: '#7C3AED',
      roleBadge: 'bg-violet-600 text-white',
      permissions,
    })
  }

  if (!staff.isActive) {
    return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 })
  }

  const { staffId: _sid, role: _r, ...permissions } = await getStaffPermissionsByEmail(session.email)

  const role = staff.role as keyof typeof ROLE_LABELS

  return NextResponse.json({
    id:        staff.id,
    name:      staff.name,
    email:     staff.email,
    role:      staff.role,
    roleTitle: staff.roleTitle,
    roleLabel: ROLE_LABELS[role]   ?? staff.role,
    roleColor: ROLE_COLORS[role]   ?? '#6B7280',
    roleBadge: ROLE_BG_CLASSES[role] ?? 'bg-gray-500 text-white',
    permissions,
  })
}
