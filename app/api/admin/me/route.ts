import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getStaffPermissionsByEmail } from '@/lib/getStaffPermissions'
import { ROLE_LABELS, ROLE_COLORS, ROLE_BG_CLASSES } from '@/lib/permissions'
import { prisma } from '@/lib/db'

/**
 * GET /api/admin/me
 * Returns the current admin staff member's profile + merged permissions.
 * Used by the useStaffPermissions() hook on the client.
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

  if (!staff || !staff.isActive) {
    return NextResponse.json({ error: 'Account inactive or not found' }, { status: 403 })
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
