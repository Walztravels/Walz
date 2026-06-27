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

    const body = await req.json().catch(() => null)
    if (!body?.permissions || typeof body.permissions !== 'object' || Array.isArray(body.permissions)) {
      return NextResponse.json({ error: 'Invalid permissions payload' }, { status: 400 })
    }

    // Label/color defaults for roles that may not yet exist in DB
    const ROLE_DISPLAY: Record<string, { label: string; color: string }> = {
      operations_manager: { label: 'Operations Manager',       color: '#2563EB' },
      general_manager:    { label: 'General Manager',          color: '#4338CA' },
      senior_manager:     { label: 'Senior Manager',           color: '#0F766E' },
      visa_officer:       { label: 'Visa Officer',             color: '#7C3AED' },
      coordinator:        { label: 'Coordinator',              color: '#D97706' },
      flight_staff:       { label: 'Flight Ticketing Staff',   color: '#0284C7' },
      tours_staff:        { label: 'Tours & Activities Staff', color: '#16A34A' },
      hotel_staff:        { label: 'Hotel Reservation Staff',  color: '#0891B2' },
      sales_agent:        { label: 'Sales Agent',              color: '#EA580C' },
      sales_rep:          { label: 'Sales Representative',     color: '#CA8A04' },
      accountant:         { label: 'Accountant',               color: '#DC2626' },
      customer_support:   { label: 'Customer Support',         color: '#4B5563' },
    }
    const meta = ROLE_DISPLAY[role] ?? { label: role, color: '#6B7280' }

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
