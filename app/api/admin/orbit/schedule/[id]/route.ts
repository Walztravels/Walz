import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const now  = new Date()

  const data: Record<string, unknown> = {}
  if (body.title       !== undefined) data.title       = body.title
  if (body.scheduledAt !== undefined) data.scheduledAt = new Date(body.scheduledAt as string)
  if (body.platform    !== undefined) data.platform    = body.platform
  if (body.metadata    !== undefined) data.metadata    = body.metadata

  if (body.status !== undefined) {
    const allowed = ['draft', 'scheduled', 'published', 'failed', 'cancelled']
    if (!allowed.includes(body.status as string)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = body.status
    if (body.status === 'published') data.publishedAt = now
    if (body.status === 'failed') { data.failedAt = now; data.error = body.error ?? 'Unknown error' }
    if (body.status === 'failed') data.retries = { increment: 1 }
  }

  const item = await prisma.orbitScheduleItem.update({
    where: { id: params.id },
    data: data as Parameters<typeof prisma.orbitScheduleItem.update>[0]['data'],
  })

  return NextResponse.json({ item })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.orbitScheduleItem.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
