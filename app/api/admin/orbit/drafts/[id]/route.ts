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

  const draft = await prisma.orbitContentDraft.findUnique({
    where: { id: params.id },
    include: {
      brief: true,
      versions: { orderBy: { version: 'desc' } },
    },
  })
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ draft })
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

  const existing = await prisma.orbitContentDraft.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Save version snapshot before updating content
  if (body.content !== undefined && body.saveVersion !== false) {
    await prisma.orbitDraftVersion.create({
      data: {
        draftId: params.id,
        version: existing.version,
        title:   existing.title,
        content: existing.content,
        savedBy: session.email,
      },
    })
  }

  const data: Record<string, unknown> = {}
  if (body.title          !== undefined) data.title          = body.title
  if (body.content        !== undefined) data.content        = body.content
  if (body.excerpt        !== undefined) data.excerpt        = body.excerpt
  if (body.metaDescription !== undefined) data.metaDescription = body.metaDescription
  if (body.focusKeyword   !== undefined) data.focusKeyword   = body.focusKeyword
  if (body.tags           !== undefined) data.tags           = body.tags
  if (body.scheduledAt    !== undefined) data.scheduledAt    = body.scheduledAt ? new Date(body.scheduledAt as string) : null
  if (body.flaggedClaims  !== undefined) data.flaggedClaims  = body.flaggedClaims

  // Status transitions
  if (body.status !== undefined) {
    const allowed = ['draft', 'review', 'approved', 'scheduled', 'published']
    if (!allowed.includes(body.status as string)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = body.status
    if (body.status === 'approved') {
      data.approvedBy = session.email
      data.approvedAt = now
    }
  }

  // Bump version number on content change
  if (body.content !== undefined && body.content !== existing.content) {
    data.version = (existing.version ?? 1) + 1
  }

  const draft = await prisma.orbitContentDraft.update({
    where: { id: params.id },
    data: data as Parameters<typeof prisma.orbitContentDraft.update>[0]['data'],
  })

  return NextResponse.json({ draft })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.orbitContentDraft.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
