import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const groupId  = searchParams.get('groupId')
  const intent   = searchParams.get('intent')
  const country  = searchParams.get('country')
  const source   = searchParams.get('source')

  const keywords = await prisma.orbitKeyword.findMany({
    where: {
      ...(groupId && { groupId }),
      ...(intent  && { intent }),
      ...(country && { country }),
      ...(source  && { source }),
    },
    include: {
      group: { select: { id: true, name: true } },
      rankings: {
        orderBy: { recordedAt: 'desc' },
        take: 2,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Attach current, previous, best, movement to each keyword
  const enriched = keywords.map(kw => {
    const [latest, prev] = kw.rankings
    const current   = latest?.position ?? null
    const previous  = prev?.position   ?? null
    const best      = kw.rankings.reduce((b, r) => {
      if (r.position === null || r.position === undefined) return b
      return b === null || r.position < b ? r.position : b
    }, null as number | null)
    const movement  = current !== null && previous !== null ? previous - current : null

    return {
      ...kw,
      rankings: undefined,
      currentPosition:  current,
      previousPosition: previous,
      bestPosition:     best,
      movement,
      latestRanking: latest ?? null,
    }
  })

  return NextResponse.json({ keywords: enriched })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    keyword?: string; groupId?: string; intent?: string; country?: string
    language?: string; device?: string; source?: string; volume?: number
    difficulty?: number; cpc?: number; notes?: string; linkedPageSlug?: string
  }

  if (!body.keyword?.trim()) return NextResponse.json({ error: 'keyword required' }, { status: 400 })

  const kw = await prisma.orbitKeyword.create({
    data: {
      keyword:        body.keyword.trim().toLowerCase(),
      groupId:        body.groupId        ?? undefined,
      intent:         body.intent         ?? 'informational',
      country:        body.country        ?? 'gb',
      language:       body.language       ?? 'en',
      device:         body.device         ?? 'desktop',
      source:         body.source         ?? 'manual',
      volume:         body.volume         ?? undefined,
      difficulty:     body.difficulty     ?? undefined,
      cpc:            body.cpc            ?? undefined,
      notes:          body.notes          ?? '',
      linkedPageSlug: body.linkedPageSlug ?? undefined,
    },
  })

  return NextResponse.json({ keyword: kw }, { status: 201 })
}
