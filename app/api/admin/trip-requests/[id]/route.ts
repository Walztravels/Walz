import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const request = await prisma.tripRequest.findUnique({ where: { id } })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Mark as viewed
  if (request.status === 'submitted' && !request.viewedByStaffAt) {
    await prisma.tripRequest.update({ where: { id }, data: { status: 'viewed', viewedByStaffAt: new Date() } })
  }
  return NextResponse.json({ request })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const request = await prisma.tripRequest.update({ where: { id }, data: { ...body, updatedAt: new Date() } })
  return NextResponse.json({ request })
}
