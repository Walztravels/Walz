import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { clearPermissionsCache } from '@/lib/getStaffPermissions'
import { getRoleCatalogEntry } from '@/lib/rbac/roles'

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

    const body = await req.json().catch(() => null)
    if (!body?.permissions || typeof body.permissions !== 'object' || Array.isArray(body.permissions)) {
      return NextResponse.json({ error: 'Invalid permissions payload' }, { status: 400 })
    }

    // Label/color defaults for roles that may not yet exist in DB — sourced
    // from the single role catalogue (lib/rbac/roles.ts) instead of a local copy.
    const catalogEntry = getRoleCatalogEntry(role)
    const meta = catalogEntry
      ? { label: catalogEntry.label, color: catalogEntry.hexColor }
      : { label: role, color: '#6B7280' }

    // upsert — creates the record if it doesn't exist yet (supports "Initialize" for new roles)
    const updated = await prisma.rolePermission.upsert({
      where:  { role },
      create: { role, label: meta.label, color: meta.color, permissions: body.permissions },
      update: { permissions: body.permissions },
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
