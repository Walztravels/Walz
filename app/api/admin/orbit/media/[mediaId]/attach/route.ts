import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST — attach a library item to a campaign
// Called when user clicks "Use this" on a library match
export async function POST(
  req: NextRequest,
  { params }: { params: { mediaId: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { campaignId?: string }
  if (!body.campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 })

  // Cap check
  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  const cap  = settings?.imageCapPerCampaign ?? 8
  const used = await prisma.orbitMedia.count({ where: { campaignId: body.campaignId } })
  if (used >= cap) {
    return NextResponse.json({
      error: `Image cap of ${cap} reached for this campaign.`,
      capReached: true, used, cap,
    }, { status: 429 })
  }

  // Duplicate the library item into the campaign (keeps original in library)
  const source = await prisma.orbitMedia.findUnique({ where: { id: params.mediaId } })
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const media = await prisma.orbitMedia.create({
    data: {
      source: source.source,
      storagePath: source.storagePath,
      publicUrl: source.publicUrl,
      format: source.format,
      destination: source.destination,
      campaignType: source.campaignType,
      prompt: source.prompt,
      altText: source.altText,
      costUsd: 0,  // no new generation cost for reuse
      campaignId: body.campaignId,
      createdBy: session.email,
    },
  })

  return NextResponse.json({ media })
}
