import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as Partial<{
    city: string; country: string; tag: string; imageUrl: string
    flightFrom: string; hotelFrom: string; visaFrom: string
    description: string; isActive: boolean; sortOrder: number
  }>

  const dest = await prisma.featuredDestination.update({
    where: { id: params.id },
    data:  body,
  })
  return NextResponse.json(dest)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  await prisma.featuredDestination.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
