/**
 * Orbit Media Library — shared asset listing (all scopes: studio + campaigns).
 *
 * Filters: q (title/tag search), mediaType, kind (generated|uploaded|design
 * export), readiness, aspect (format), creator, includeArchived.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const sp = req.nextUrl.searchParams
    const q          = sp.get('q')?.trim() ?? ''
    const mediaType  = sp.get('mediaType')
    const kind       = sp.get('kind')          // 'generated' | 'uploaded' | 'export'
    const readiness  = sp.get('readiness')
    const format     = sp.get('format')
    const creator    = sp.get('creator')
    const includeArchived = sp.get('includeArchived') === '1'

    const where: Record<string, unknown> = {
      isReference: false,
      ...(includeArchived ? {} : { readiness: { not: 'archived' } }),
      ...(mediaType ? { mediaType } : {}),
      ...(readiness ? { readiness } : {}),
      ...(format ? { format } : {}),
      ...(creator ? { createdBy: creator } : {}),
      ...(kind === 'export'    ? { provider: 'compositor' } : {}),
      ...(kind === 'uploaded'  ? { source: 'uploaded' } : {}),
      ...(kind === 'generated' ? { source: 'generated', provider: { not: 'compositor' } } : {}),
      ...(q ? { OR: [
        { title:   { contains: q, mode: 'insensitive' } },
        { altText: { contains: q, mode: 'insensitive' } },
        { tags:    { array_contains: q } },
      ] } : {}),
    }

    const assets = await prisma.orbitMedia.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: 120,
      select: {
        id: true, title: true, mediaType: true, format: true, publicUrl: true,
        readiness: true, saveError: true, provider: true, model: true,
        width: true, height: true, durationMs: true, sizeBytes: true, mimeType: true,
        tags: true, version: true, assetGroupId: true, designProjectId: true,
        createdBy: true, createdAt: true, campaignId: true, status: true,
        generationStatus: true,
        _count: { select: { campaignLinks: true } },
      },
    })

    const creators = [...new Set(assets.map(a => a.createdBy).filter(Boolean))] as string[]
    return NextResponse.json({ assets, creators })
  } catch (err) {
    console.error('[orbit library GET]', err)
    return NextResponse.json({ error: 'Failed to load the media library' }, { status: 500 })
  }
}
