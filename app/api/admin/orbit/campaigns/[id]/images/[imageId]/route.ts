import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; imageId: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const image = await prisma.orbitCampaignImage.findUnique({ where: { id: params.imageId } })
  if (!image || image.campaignId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({})) as { action?: string; altText?: string }
  const now = new Date()

  if (body.action === 'approve') {
    await prisma.orbitCampaignImage.update({
      where: { id: params.imageId },
      data: { status: 'approved', approvedBy: session.email, approvedAt: now },
    })
  } else if (body.action === 'reject') {
    await prisma.orbitCampaignImage.update({
      where: { id: params.imageId },
      data: { status: 'rejected' },
    })
  } else if (body.altText !== undefined) {
    await prisma.orbitCampaignImage.update({
      where: { id: params.imageId },
      data: { altText: body.altText },
    })
  }

  const updated = await prisma.orbitCampaignImage.findUnique({ where: { id: params.imageId } })
  return NextResponse.json({ image: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; imageId: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.orbitCampaignImage.delete({ where: { id: params.imageId } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
