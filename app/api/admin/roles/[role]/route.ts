import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { clearPermissionsCache } from '@/lib/getStaffPermissions'

/**
 * PATCH /api/admin/roles/[role]
 * Updates the default permissions for a role.
 * Only super_admin can call this.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ role: string }> }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only super_admin can edit role permissions
  if ((session.staffRole ?? '') !== 'super_admin') {
    return NextResponse.json({ error: 'Only Super Admin can edit role permissions.' }, { status: 403 })
  }

  const { role } = await params

  // Prevent editing super_admin permissions via UI
  if (role === 'super_admin') {
    return NextResponse.json({ error: 'Super Admin permissions cannot be modified.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.permissions || typeof body.permissions !== 'object') {
    return NextResponse.json({ error: 'Invalid permissions payload' }, { status: 400 })
  }

  const updated = await prisma.rolePermission.update({
    where: { role },
    data:  { permissions: body.permissions },
  })

  // Clear in-memory permissions cache so changes take effect on next API call
  clearPermissionsCache()

  // Log the action
  const staff = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: { id: true, name: true },
  })
  if (staff) {
    await prisma.activityLog.create({
      data: {
        staffId:   staff.id,
        staffName: staff.name,
        action:    'Role Permissions Updated',
        detail:    `${staff.name} updated permissions for role: ${role}`,
      },
    }).catch(() => {})
  }

  return NextResponse.json(updated)
}
