import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

type Params = { params: { id: string } }

// GET /api/visa-application/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const app = await prisma.visaApplication.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { notes: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ application: app })
}

// PATCH /api/visa-application/[id] — auto-save form fields
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const existing = await prisma.visaApplication.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only allow editing draft / received (before paid and processed)
  const editableStatuses = ['draft', 'received']
  if (!editableStatuses.includes(existing.status)) {
    return NextResponse.json({ error: 'Application cannot be edited in current status' }, { status: 409 })
  }

  const body = await req.json()

  // Parse date fields
  const dateFields = ['dateOfBirth', 'passportIssueDate', 'passportExpiryDate', 'arrivalDate', 'returnDate']
  const data: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(body)) {
    if (key === 'id' || key === 'userId' || key === 'referenceNumber' || key === 'createdAt') continue
    if (dateFields.includes(key)) {
      data[key] = value ? new Date(value as string) : null
    } else {
      data[key] = value
    }
  }

  const updated = await prisma.visaApplication.update({
    where: { id: params.id },
    data: { ...data, updatedAt: new Date() },
  })

  return NextResponse.json({ application: updated })
}

// DELETE /api/visa-application/[id] — only drafts
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const existing = await prisma.visaApplication.findFirst({
    where: { id: params.id, userId: session.user.id, isDraft: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found or not a draft' }, { status: 404 })

  await prisma.visaApplication.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
