import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ── PATCH — approve / reject / alt text ──────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; imageId: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const media = await prisma.orbitMedia.findUnique({ where: { id: params.imageId } })
  if (!media || media.campaignId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({})) as { action?: string; altText?: string }

  if (body.action === 'approve') {
    await prisma.orbitMedia.update({
      where: { id: params.imageId },
      data: { status: 'approved', approvedBy: session.email, approvedAt: new Date() },
    })
  } else if (body.action === 'reject') {
    await prisma.orbitMedia.update({
      where: { id: params.imageId },
      data: { status: 'rejected' },
    })
  } else if (body.altText !== undefined) {
    await prisma.orbitMedia.update({
      where: { id: params.imageId },
      data: { altText: body.altText },
    })
  }

  const updated = await prisma.orbitMedia.findUnique({ where: { id: params.imageId } })
  return NextResponse.json({ media: updated })
}

// ── DELETE — remove from campaign (detach or fully delete) ────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; imageId: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const media = await prisma.orbitMedia.findUnique({ where: { id: params.imageId } })
  if (!media || media.campaignId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (media.source === 'uploaded') {
    // Uploaded photos: detach from campaign but keep in library
    await prisma.orbitMedia.update({
      where: { id: params.imageId },
      data: { campaignId: null },
    }).catch(() => {})
  } else {
    // Generated: fully delete (counts against regenerate budget)
    await prisma.orbitMedia.delete({ where: { id: params.imageId } }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
