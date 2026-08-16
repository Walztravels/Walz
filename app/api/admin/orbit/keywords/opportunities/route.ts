import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get all keywords with their latest ranking
  const keywords = await prisma.orbitKeyword.findMany({
    include: {
      rankings: { orderBy: { recordedAt: 'desc' }, take: 1 },
      group: { select: { id: true, name: true } },
    },
  })

  // ── Near page-1 opportunities (positions 11–20) ──────────────────────────────
  const nearPageOne = keywords
    .filter(kw => {
      const pos = kw.rankings[0]?.position
      return pos !== null && pos !== undefined && pos >= 11 && pos <= 20
    })
    .map(kw => ({
      id:       kw.id,
      keyword:  kw.keyword,
      position: kw.rankings[0]?.position,
      url:      kw.rankings[0]?.url,
      clicks:   kw.rankings[0]?.clicks,
      impressions: kw.rankings[0]?.impressions,
      group:    kw.group,
      intent:   kw.intent,
    }))
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))

  // ── Cannibalization: multiple keywords with same linkedPageSlug ─────────────
  const byPage = new Map<string, typeof keywords>()
  for (const kw of keywords) {
    if (!kw.linkedPageSlug) continue
    const existing = byPage.get(kw.linkedPageSlug) ?? []
    byPage.set(kw.linkedPageSlug, [...existing, kw])
  }

  const cannibalization = Array.from(byPage.entries())
    .filter(([, kws]) => kws.length > 1)
    .map(([pageSlug, kws]) => ({
      pageSlug,
      keywords: kws.map(kw => ({
        id:       kw.id,
        keyword:  kw.keyword,
        position: kw.rankings[0]?.position ?? null,
        clicks:   kw.rankings[0]?.clicks   ?? null,
        intent:   kw.intent,
      })),
    }))

  // ── Unassigned: keywords with no linkedPageSlug and no brief ─────────────────
  const briefKeywordIds = new Set(
    (await prisma.orbitContentBrief.findMany({ select: { keywordId: true } }))
      .map(b => b.keywordId)
      .filter(Boolean) as string[]
  )

  const unassigned = keywords
    .filter(kw => !kw.linkedPageSlug && !briefKeywordIds.has(kw.id))
    .filter(kw => {
      const pos = kw.rankings[0]?.position
      return pos !== null && pos !== undefined
    })
    .map(kw => ({
      id:       kw.id,
      keyword:  kw.keyword,
      position: kw.rankings[0]?.position,
      clicks:   kw.rankings[0]?.clicks,
      impressions: kw.rankings[0]?.impressions,
      intent:   kw.intent,
      group:    kw.group,
    }))
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
    .slice(0, 50)

  return NextResponse.json({ nearPageOne, cannibalization, unassigned })
}
