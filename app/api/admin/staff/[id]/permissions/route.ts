import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 })
  }

  const body = await req.json() as {
    permissions?: Record<string, boolean | null>
    role?:        string
    branch?:      string
    department?:  string
  }

  const updates: Record<string, unknown> = {}

  if (body.permissions !== undefined) {
    // Strip null entries (null = revert to role default)
    const cleaned: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(body.permissions ?? {})) {
      if (v !== null) cleaned[k] = v
    }
    updates.permissions = cleaned
  }

  if (body.role)       updates.role       = body.role
  if (body.branch)     updates.branch     = body.branch
  if (body.department) updates.department = body.department

  const staff = await prisma.staff.update({
    where:  { id: params.id },
    data:   updates,
    select: { id: true, name: true, email: true, role: true, branch: true, department: true, permissions: true },
  })

  await prisma.activityLog.create({
    data: {
      staffId:    session.id,
      staffName:  session.name,
      staffRole:  session.role,
      action:     'staff_permissions_updated',
      module:     'staff',
      entityId:   params.id,
      entityType: 'staff',
      detail:     `Permissions/role updated for ${staff.name} (${staff.email})`,
    },
  })

  return NextResponse.json({ staff })
}
