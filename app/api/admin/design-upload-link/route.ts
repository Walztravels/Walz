import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET — list all links (super_admin only)
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const links = await prisma.designUploadLink.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ links })
}

// POST — create a new link
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { label?: string }

  const link = await prisma.designUploadLink.create({
    data: {
      label:     body.label?.trim() || 'Design team uploads',
      createdBy: session.id,
    },
  })

  return NextResponse.json({ link })
}

// PATCH — toggle active/inactive
export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { id: string; isActive: boolean }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const link = await prisma.designUploadLink.update({
    where: { id: body.id },
    data:  { isActive: body.isActive },
  })

  return NextResponse.json({ link })
}
