import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const members = await prisma.teamMember.findMany({ orderBy: { order: 'asc' } })
  return NextResponse.json(members)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const member = await prisma.teamMember.create({
    data: { name: body.name, role: body.role, bio: body.bio ?? null, photoUrl: body.photoUrl ?? null, whatsapp: body.whatsapp ?? null, order: body.order ?? 0, active: body.active ?? true }
  })
  return NextResponse.json(member, { status: 201 })
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, ...rest } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const member = await prisma.teamMember.update({ where: { id }, data: rest })
  return NextResponse.json(member)
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.teamMember.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
