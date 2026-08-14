import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import {
  createDesignFromTemplate,
  exportDesign,
  isCanvaConfigured,
  type CanvaFormat,
  type TextLayers,
} from '@/lib/orbit/canva-adapter'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const images = await prisma.orbitCampaignImage.findMany({
    where: { campaignId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ images, canvaConfigured: isCanvaConfigured() })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isCanvaConfigured()) {
    return NextResponse.json({
      error: 'Canva is not configured. Add CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, and CANVA_BRAND_TEMPLATE_ID to environment variables.',
      notConfigured: true,
    }, { status: 503 })
  }

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    format: CanvaFormat
    textLayers: TextLayers
    altText?: string
  }

  if (!body.format) return NextResponse.json({ error: 'format is required' }, { status: 400 })

  // Create record as draft immediately so UI can show progress
  const image = await prisma.orbitCampaignImage.create({
    data: {
      campaignId: params.id,
      format: body.format,
      textLayers: body.textLayers as unknown as import('@prisma/client').Prisma.InputJsonValue,
      altText: body.altText ?? '',
      createdBy: session.email,
    },
  })

  try {
    // 1. Create design in Canva from brand template
    const { designId, editUrl } = await createDesignFromTemplate(body.textLayers, body.format)

    // 2. Export to PNG
    const { exportUrl } = await exportDesign(designId)

    // 3. Update record with Canva design ID and export URL
    const updated = await prisma.orbitCampaignImage.update({
      where: { id: image.id },
      data: { canvaDesignId: designId, exportUrl, thumbnailUrl: exportUrl },
    })

    return NextResponse.json({ image: updated, editUrl })
  } catch (err) {
    // Clean up the pending record on failure
    await prisma.orbitCampaignImage.delete({ where: { id: image.id } }).catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
