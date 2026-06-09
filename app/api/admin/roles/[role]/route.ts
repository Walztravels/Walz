import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { clearPermissionsCache } from '@/lib/getStaffPermissions'

/**
 * PATCH /api/admin/roles/[role]
 * Updates the default permissions for a role.
 * Only super_admin can call this (checked via JWT then DB fallback).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { role: string } }
) {
  try {
    const session = await getAdminSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check super_admin — JWT first, then DB fallback
    const jwtIsSuperAdmin = (session.staffRole ?? '') === 'super_admin'
    if (!jwtIsSuperAdmin) {
      const staffRecord = await prisma.staff.findUnique({
        where:  { email: session.email },
        select: { role: true },
      })
      if (staffRecord?.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Only Super Admin can edit role permissions.' },
          { status: 403 }
        )
      }
    }

    const role = params.role

    if (role === 'super_admin') {
      return NextResponse.json(
        { error: 'Super Admin permissions cannot be modified.' },
        { status: 400 }
      )
    }

    // Validate that the role record exists
    const existing = await prisma.rolePermission.findUnique({ where: { role } })
    if (!existing) {
      return NextResponse.json({ error: `Role '${role}' not found.` }, { status: 404 })
    }

    const body = await req.json().catch(() => null)
    if (!body?.permissions || typeof body.permissions !== 'object' || Array.isArray(body.permissions)) {
      return NextResponse.json({ error: 'Invalid permissions payload' }, { status: 400 })
    }

    const updated = await prisma.rolePermission.update({
      where: { role },
      data:  { permissions: body.permissions },
    })

    // Clear in-memory cache so changes take effect immediately
    clearPermissionsCache()

    // Activity log (non-fatal)
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

    return NextResponse.json({ success: true, role: updated.role, label: updated.label })

  } catch (err) {
    console.error('[PATCH /api/admin/roles/[role]] error:', err)
    return NextResponse.json(
      { error: 'Server error — could not save role.' },
      { status: 500 }
    )
  }
}
