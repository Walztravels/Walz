import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST — import a MarketingMedia item into an Orbit campaign
// Creates a new OrbitMedia record pointing to the same public URL.
export async function POST(
  req: NextRequest,
  { params }: { params: { mediaId: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { campaignId?: string; format?: string }
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

  const source = await prisma.marketingMedia.findUnique({ where: { id: params.mediaId } })
  if (!source) return NextResponse.json({ error: 'Media not found' }, { status: 404 })

  // Derive a storage path from the public URL (last two path segments)
  const urlPath     = new URL(source.url).pathname
  const storagePath = urlPath.split('/').slice(-2).join('/')

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: body.campaignId } })

  const media = await prisma.orbitMedia.create({
    data: {
      source:       'uploaded',
      storagePath,
      publicUrl:    source.url,
      format:       body.format ?? '1080x1350',
      destination:  campaign?.destination ?? null,
      campaignType: campaign?.objective   ?? null,
      altText:      source.altText        ?? source.filename,
      costUsd:      0,
      status:       'draft',
      campaignId:   body.campaignId,
      createdBy:    session.email,
    },
  })

  return NextResponse.json({ media })
}
