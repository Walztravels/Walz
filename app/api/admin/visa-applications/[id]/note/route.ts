import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

type Params = { params: Promise<{ id: string }> }

// POST /api/admin/visa-applications/[id]/note — add admin note
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const { content, authorName } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  const note = await prisma.visaApplicationNote.create({
    data: {
      applicationId: id,
      authorName: authorName ?? 'Admin',
      content: content.trim(),
    },
  })

  return NextResponse.json({ note }, { status: 201 })
}

// GET /api/admin/visa-applications/[id]/note — list notes
export async function GET(_req: NextRequest, { params }: Params) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params

  const notes = await prisma.visaApplicationNote.findMany({
    where: { applicationId: id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ notes })
}
