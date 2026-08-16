import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const brief = await prisma.orbitContentBrief.findUnique({
    where: { id: params.id },
    include: {
      keyword: true,
      drafts: {
        orderBy: { version: 'desc' },
        include: { _count: { select: { versions: true } } },
      },
    },
  })
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ brief })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const now  = new Date()

  const data: Record<string, unknown> = {}
  if (body.title              !== undefined) data.title              = body.title
  if (body.primaryKeyword     !== undefined) data.primaryKeyword     = body.primaryKeyword
  if (body.supportingKeywords !== undefined) data.supportingKeywords = body.supportingKeywords
  if (body.intent             !== undefined) data.intent             = body.intent
  if (body.contentType        !== undefined) data.contentType        = body.contentType
  if (body.suggestedUrl       !== undefined) data.suggestedUrl       = body.suggestedUrl
  if (body.metaDescription    !== undefined) data.metaDescription    = body.metaDescription
  if (body.outline            !== undefined) data.outline            = body.outline
  if (body.faqs               !== undefined) data.faqs               = body.faqs
  if (body.internalLinks      !== undefined) data.internalLinks      = body.internalLinks
  if (body.externalSources    !== undefined) data.externalSources    = body.externalSources
  if (body.structuredData     !== undefined) data.structuredData     = body.structuredData
  if (body.keywordId          !== undefined) data.keywordId          = body.keywordId
  if (body.linkedPostId       !== undefined) data.linkedPostId       = body.linkedPostId

  // Status transitions
  if (body.status !== undefined) {
    const allowed = ['draft', 'approved', 'in_progress', 'published', 'archived']
    if (!allowed.includes(body.status as string)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = body.status
    if (body.status === 'approved') {
      data.approvedBy = session.email
      data.approvedAt = now
    }
  }

  const brief = await prisma.orbitContentBrief.update({
    where: { id: params.id },
    data: data as Parameters<typeof prisma.orbitContentBrief.update>[0]['data'],
  })

  return NextResponse.json({ brief })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.orbitContentBrief.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
