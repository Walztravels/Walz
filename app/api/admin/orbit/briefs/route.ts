import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status      = searchParams.get('status')
  const contentType = searchParams.get('contentType')

  const briefs = await prisma.orbitContentBrief.findMany({
    where: {
      ...(status      && { status }),
      ...(contentType && { contentType }),
    },
    include: {
      keyword: { select: { id: true, keyword: true } },
      _count:  { select: { drafts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ briefs })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    primaryKeyword?: string; keywordId?: string; title?: string
    contentType?: string; intent?: string; suggestedUrl?: string
    metaDescription?: string; supportingKeywords?: string[]
  }

  if (!body.primaryKeyword?.trim()) return NextResponse.json({ error: 'primaryKeyword required' }, { status: 400 })
  if (!body.title?.trim())          return NextResponse.json({ error: 'title required' }, { status: 400 })

  const brief = await prisma.orbitContentBrief.create({
    data: {
      primaryKeyword:     body.primaryKeyword.trim(),
      keywordId:          body.keywordId     ?? undefined,
      title:              body.title.trim(),
      contentType:        body.contentType   ?? 'destination_guide',
      intent:             body.intent        ?? 'informational',
      suggestedUrl:       body.suggestedUrl  ?? undefined,
      metaDescription:    body.metaDescription ?? undefined,
      supportingKeywords: body.supportingKeywords ?? [],
      generatedBy:        session.email,
    },
  })

  return NextResponse.json({ brief }, { status: 201 })
}
