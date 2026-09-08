/**
 * Orbit Media Library — single asset: detail (with usage + versions),
 * rename/tag, and actions (archive, new version).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { archiveAsset, createAssetVersion, getAssetUsage } from '@/lib/orbit/media-library'

export const dynamic = 'force-dynamic'

async function guard() {
  const session = await getAdminSession()
  if (!session) return { error: 'Unauthorized', status: 401 as const }
  if (session.role !== 'super_admin') return { error: 'Forbidden', status: 403 as const }
  return { session }
}

// GET — asset detail: metadata, where it is used, and its version history.
export async function GET(_req: NextRequest, { params }: { params: { mediaId: string } }) {
  const g = await guard()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  try {
    const asset = await prisma.orbitMedia.findUnique({ where: { id: params.mediaId } })
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    const groupId = asset.assetGroupId ?? asset.id
    const [usage, versions, fileCheck] = await Promise.all([
      getAssetUsage(asset.id),
      prisma.orbitMedia.findMany({
        where:   { OR: [{ assetGroupId: groupId }, { id: groupId }] },
        orderBy: { version: 'desc' },
        select:  { id: true, version: true, readiness: true, publicUrl: true, createdAt: true, createdBy: true },
      }),
      // A storage URL alone does not prove the file exists — HEAD-check it.
      (async () => {
        if (!asset.publicUrl) return { reachable: false, note: 'no file URL' }
        try {
          const head = await fetch(asset.publicUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
          return {
            reachable: head.ok,
            note: head.ok
              ? `file verified (HTTP ${head.status}, ${head.headers.get('content-length') ?? '?'} bytes)`
              : `file NOT reachable (HTTP ${head.status})`,
          }
        } catch {
          return { reachable: false, note: 'file check timed out or failed' }
        }
      })(),
    ])
    return NextResponse.json({ asset, usage, versions, fileCheck })
  } catch (err) {
    console.error('[library asset GET]', err)
    return NextResponse.json({ error: 'Failed to load asset' }, { status: 500 })
  }
}

// PATCH — rename / retag.
export async function PATCH(req: NextRequest, { params }: { params: { mediaId: string } }) {
  const g = await guard()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  try {
    const body = await req.json().catch(() => ({}))
    const data: Record<string, unknown> = {}
    if (typeof body.title === 'string') {
      const t = body.title.trim().slice(0, 160)
      if (!t) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
      data.title = t
    }
    if (Array.isArray(body.tags)) {
      data.tags = body.tags.filter((t: unknown): t is string => typeof t === 'string' && !!t.trim())
        .map((t: string) => t.trim().slice(0, 40)).slice(0, 20)
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    const asset = await prisma.orbitMedia.update({ where: { id: params.mediaId }, data })
    return NextResponse.json({ asset })
  } catch (err) {
    console.error('[library asset PATCH]', err)
    return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 })
  }
}

// POST — actions: archive | unarchive | new_version
export async function POST(req: NextRequest, { params }: { params: { mediaId: string } }) {
  const g = await guard()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  try {
    const body = await req.json().catch(() => ({}))
    if (body.action === 'archive') {
      const res = await archiveAsset(params.mediaId)
      if (!res.ok) {
        // Destructive-safe: explain exactly which campaigns depend on it
        const names = res.blockedBy.map(c => `"${c.objective}" (${c.status})`).join(', ')
        return NextResponse.json({
          error: `Cannot archive — this asset is used by active campaign(s): ${names}. Detach it there first.`,
          blockedBy: res.blockedBy,
        }, { status: 409 })
      }
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'unarchive') {
      const asset = await prisma.orbitMedia.findUnique({ where: { id: params.mediaId }, select: { publicUrl: true } })
      if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
      await prisma.orbitMedia.update({
        where: { id: params.mediaId },
        data:  { readiness: asset.publicUrl?.includes('/storage/v1/object/public/orbit-media/') ? 'ready' : 'draft' },
      })
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'new_version') {
      const v = await createAssetVersion(params.mediaId, g.session.email)
      return NextResponse.json({ ok: true, ...v })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[library asset POST]', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
