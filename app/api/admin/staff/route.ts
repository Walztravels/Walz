import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

// GET  /api/admin/staff  — list all staff
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const staff = await prisma.staff.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true, name: true, email: true, roleTitle: true,
      accessLevel: true, isActive: true, lastLoginAt: true, createdAt: true,
    },
  })

  return NextResponse.json({ staff })
}

// POST /api/admin/staff  — create staff member
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { name, email, roleTitle, accessLevel, password } = body as Record<string, string>

  if (!name || !email || !roleTitle || !accessLevel || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  const VALID_LEVELS = ['Admin', 'Manager', 'Coordinator', 'Sales']
  if (!VALID_LEVELS.includes(accessLevel)) {
    return NextResponse.json({ error: 'Invalid access level' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const existing = await prisma.staff.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    return NextResponse.json({ error: 'A staff member with this email already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const staff = await prisma.staff.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      roleTitle: roleTitle.trim(),
      accessLevel,
      isActive: true,
    },
    select: {
      id: true, name: true, email: true, roleTitle: true,
      accessLevel: true, isActive: true, createdAt: true,
    },
  })

  // Log the action
  await prisma.activityLog.create({
    data: {
      action: 'staff_created',
      detail: `Staff member ${staff.name} (${staff.email}) created with access level: ${accessLevel}`,
    },
  })

  return NextResponse.json({ staff }, { status: 201 })
}
