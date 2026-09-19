import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getAdminSession, invalidateAdminSessionCache } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { ALL_ROLE_VALUES, ROLE_CATALOG_MAP, requireConfiguredRole } from '@/lib/rbac/roles'

// ── GET — fetch a single staff member ─────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staff = await prisma.staff.findUnique({
    where:  { id: params.id },
    select: {
      id:               true,
      name:             true,
      email:            true,
      role:             true,
      roleTitle:        true,
      sendingEmail:     true,
      signatureTagline: true,
      branch:           true,
      department:       true,
      permissions:      true,
      isActive:         true,
    },
  })

  if (!staff) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ staff })
}

// All 13 catalogue roles are assignable (previously hardcoded to 5 — see
// app/api/admin/staff/route.ts for the same note). requireConfiguredRole()
// below is what now stops an assignable-but-unconfigured role from being
// saved silently.
const VALID_ROLES: string[] = ALL_ROLE_VALUES

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_ROLE_VALUES.map(v => [v, ROLE_CATALOG_MAP[v].label]),
)

const ROLE_TO_ACCESS: Record<string, string> = {
  super_admin:     'Admin',
  general_manager: 'Manager',
  senior_manager:  'Manager',
  coordinator:     'Coordinator',
  sales_rep:       'Sales',
}

// ── PUT — update staff member ─────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSuperAdmin = session.staffRole === 'super_admin'

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const existing = await prisma.staff.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Non-super-admins cannot edit super_admin accounts
  if (!isSuperAdmin && existing.role === 'super_admin') {
    return NextResponse.json({ error: 'Cannot edit a Super Admin account' }, { status: 403 })
  }

  const { name, roleTitle, sendingEmail, signatureTagline, role, portalAccess, isActive, checkInTracked } =
    body as Record<string, string | boolean>

  if (role !== undefined) {
    const roleStr = String(role)
    if (!VALID_ROLES.includes(roleStr)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    // Non-super-admins cannot promote anyone to super_admin
    if (!isSuperAdmin && roleStr === 'super_admin') {
      return NextResponse.json({ error: 'Only Super Admins can assign the Super Admin role' }, { status: 403 })
    }
    // Refuse to assign a role that has no RolePermission row — it would
    // silently resolve to zero permissions on this staff member's next login.
    const roleCheck = await requireConfiguredRole(
      r => prisma.rolePermission.findUnique({ where: { role: r }, select: { role: true } }),
      roleStr,
    )
    if (!roleCheck.ok) {
      return NextResponse.json({ error: roleCheck.error }, { status: 400 })
    }
  }

  const updateData: Record<string, unknown> = {}
  if (name             !== undefined) updateData.name             = String(name).trim()
  if (roleTitle        !== undefined) updateData.roleTitle         = String(roleTitle).trim()
  if (sendingEmail     !== undefined) updateData.sendingEmail      = String(sendingEmail).trim() || null
  if (signatureTagline !== undefined) updateData.signatureTagline  = String(signatureTagline).trim() || null
  if (role         !== undefined) {
    updateData.role        = String(role)
    updateData.accessLevel = ROLE_TO_ACCESS[String(role)] ?? 'Sales'
  }
  if (portalAccess    !== undefined) updateData.portalAccess    = Boolean(portalAccess)
  if (isActive        !== undefined) updateData.isActive        = Boolean(isActive)
  if (checkInTracked  !== undefined) updateData.checkInTracked  = Boolean(checkInTracked)

  const staff = await prisma.staff.update({
    where: { id: params.id },
    data:  updateData,
    select: {
      id: true, name: true, email: true, roleTitle: true,
      role: true, portalAccess: true, isActive: true,
      lastLoginAt: true, createdAt: true,
    },
  })
  // Session cache: role/active changes apply immediately on this instance
  // (other warm instances converge within the 60s cache TTL).
  invalidateAdminSessionCache(staff.email)

  const changedFields = Object.keys(updateData)
  const detail = changedFields.includes('role')
    ? `${staff.name}'s role updated to ${ROLE_LABELS[String(role)]}`
    : `${staff.name} (${staff.email}) updated — ${changedFields.join(', ')}`

  await prisma.activityLog.create({
    data: { action: 'staff_updated', detail },
  }).catch(() => {})

  return NextResponse.json({ staff })
}

// ── DELETE — remove staff member ──────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Only super_admin can delete staff accounts
  if (session.staffRole !== 'super_admin') {
    return NextResponse.json({ error: 'Only Super Admins can delete staff accounts' }, { status: 403 })
  }

  const existing = await prisma.staff.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.staff.delete({ where: { id: params.id } })

  await prisma.activityLog.create({
    data: {
      action: 'staff_deleted',
      detail: `${existing.name} (${existing.email}) was removed`,
    },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}

// ── POST — reset password ─────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const { newPassword } = (body ?? {}) as { newPassword?: string }

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const existing = await prisma.staff.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.staff.update({ where: { id: params.id }, data: { passwordHash } })

  await prisma.activityLog.create({
    data: {
      action: 'password_reset',
      detail: `Password reset for ${existing.name} (${existing.email})`,
    },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
