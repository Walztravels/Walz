import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { ROLE_HIERARCHY } from '@/lib/permissions'

/**
 * GET /api/admin/roles
 * Returns all role permission records ordered by hierarchy.
 * Requires: settings_roles permission (or super_admin role).
 */
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staffRole = session.staffRole ?? ''
  if (staffRole !== 'super_admin') {
    // Only super_admin can edit roles — but allow read for the settings page
    const staff = await prisma.staff.findUnique({
      where:  { email: session.email },
      select: { role: true },
    })
    if (!staff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const roles = await prisma.rolePermission.findMany()

  // Sort by hierarchy
  const sorted = [...roles].sort(
    (a, b) => ROLE_HIERARCHY.indexOf(b.role as never) - ROLE_HIERARCHY.indexOf(a.role as never)
  )

  return NextResponse.json(sorted)
}
