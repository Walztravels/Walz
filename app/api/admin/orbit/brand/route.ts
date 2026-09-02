/**
 * Orbit Brand Assets API
 *
 * GET  /api/admin/orbit/brand
 *   Returns all current brand assets (one per variant, latest wins).
 *
 * DELETE /api/admin/orbit/brand?id=...
 *   Remove a specific brand asset by id.
 *
 * RBAC: super_admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { prisma }                    from '@/lib/db'

export const dynamic = 'force-dynamic'

const VALID_VARIANTS = new Set(['PRIMARY', 'LIGHT', 'DARK', 'MONOCHROME', 'ICON'] as const)

// ── GET — list brand assets ───────────────────────────────────────────────────

export async function GET() {
  const session = await getAdminSession()
  if (!session)                       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const all = await prisma.orbitBrandAsset.findMany({
    orderBy: { createdAt: 'desc' },
  })

  // Reduce to one-per-variant (latest upload wins per variant)
  const byVariant: Record<string, typeof all[0]> = {}
  for (const asset of all) {
    if (!byVariant[asset.variant]) byVariant[asset.variant] = asset
  }

  return NextResponse.json({ assets: Object.values(byVariant), all })
}

// ── DELETE — remove a brand asset ────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session)                       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const existing = await prisma.orbitBrandAsset.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  await prisma.orbitBrandAsset.delete({ where: { id } })

  return NextResponse.json({ deleted: id })
}
