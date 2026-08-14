import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const SUPER_ADMIN = 'super_admin'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ campaign })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { action, rejectionReason } = body

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()

  if (action === 'approve') {
    if (campaign.status !== 'review') {
      return NextResponse.json({ error: 'Can only approve a campaign in review status' }, { status: 400 })
    }
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { status: 'approved', approvedBy: session.email, approvedAt: now },
    })
  } else if (action === 'reject') {
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { status: 'rejected', rejectedBy: session.email, rejectedAt: now, rejectionReason: rejectionReason ?? '' },
    })
  } else if (action === 'publish') {
    if (campaign.status !== 'approved') {
      return NextResponse.json({ error: 'Campaign must be approved before publishing' }, { status: 400 })
    }
    if (!campaign.approvedBy) {
      return NextResponse.json({ error: 'No approver recorded — cannot publish' }, { status: 400 })
    }
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { status: 'published', publishedAt: now },
    })
  } else if (action === 'draft') {
    await prisma.orbitCampaign.update({
      where: { id: params.id },
      data: { status: 'draft' },
    })
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const updated = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  return NextResponse.json({ campaign: updated })
}
