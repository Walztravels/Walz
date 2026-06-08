import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

// PUT /api/admin/staff/[id]  — update staff member
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const existing = await prisma.staff.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { name, email, roleTitle, accessLevel, role, isActive } = body as Record<string, string | boolean>

  const VALID_LEVELS = ['Admin', 'Manager', 'Coordinator', 'Sales']
  if (accessLevel && !VALID_LEVELS.includes(accessLevel as string)) {
    return NextResponse.json({ error: 'Invalid access level' }, { status: 400 })
  }

  const VALID_ROLES = ['super_admin', 'general_manager', 'senior_manager', 'coordinator', 'sales_rep']
  if (role && !VALID_ROLES.includes(role as string)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (name        !== undefined) updateData.name        = String(name).trim()
  if (email       !== undefined) updateData.email       = String(email).toLowerCase().trim()
  if (roleTitle   !== undefined) updateData.roleTitle   = String(roleTitle).trim()
  if (accessLevel !== undefined) updateData.accessLevel = accessLevel
  if (role        !== undefined) updateData.role        = role
  if (isActive    !== undefined) updateData.isActive    = Boolean(isActive)

  const staff = await prisma.staff.update({
    where: { id: params.id },
    data: updateData,
    select: {
      id: true, name: true, email: true, roleTitle: true,
      accessLevel: true, role: true, isActive: true, lastLoginAt: true, createdAt: true,
    },
  })

  await prisma.activityLog.create({
    data: {
      action: 'staff_updated',
      detail: `Staff member ${staff.name} updated. Changes: ${Object.keys(updateData).join(', ')}`,
    },
  })

  return NextResponse.json({ staff })
}

// DELETE /api/admin/staff/[id]  — remove staff member
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.staff.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.staff.delete({ where: { id: params.id } })

  await prisma.activityLog.create({
    data: {
      action: 'staff_deleted',
      detail: `Staff member ${existing.name} (${existing.email}) was removed`,
    },
  })

  return NextResponse.json({ success: true })
}

// POST /api/admin/staff/[id]  — reset password
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
  })

  return NextResponse.json({ success: true })
}
