import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const updateSchema = z.object({
  name:        z.string().min(1).max(120).optional(),
  oldPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
}).partial()

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { id: true, name: true, email: true, createdAt: true },
  })

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ user })
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 })

  const { name, oldPassword, newPassword } = parsed.data

  // If changing password, verify current one first
  if (newPassword) {
    if (!oldPassword) return NextResponse.json({ error: 'Current password required' }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!user?.password) return NextResponse.json({ error: 'Cannot change password for social accounts' }, { status: 400 })

    const valid = await bcrypt.compare(oldPassword, user.password)
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (name)        updateData.name     = name.trim()
  if (newPassword) updateData.password = await bcrypt.hash(newPassword, 12)

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ message: 'Nothing to update' })
  }

  const updated = await prisma.user.update({
    where:  { id: session.user.id },
    data:   updateData,
    select: { id: true, name: true, email: true },
  })

  return NextResponse.json({ user: updated })
}
