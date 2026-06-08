import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

type Params = { params: { id: string } }

// GET /api/visa-application/[id]
// Accepts session auth (client) OR token query param (admin-initiated)
export async function GET(req: NextRequest, { params }: Params) {
  const tokenParam = req.nextUrl.searchParams.get('token')

  if (tokenParam) {
    // Token-based access — no session required
    const tokenRecord = await prisma.visaApplicationToken.findUnique({ where: { token: tokenParam } })
    if (!tokenRecord || tokenRecord.applicationId !== params.id || new Date() > tokenRecord.expiresAt) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }
    const app = await prisma.visaApplication.findUnique({
      where: { id: params.id },
      include: { notes: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ application: app })
  }

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
// Accepts session auth OR _token in body (admin-initiated token flow)
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json()
  const { _token, ...fields } = body

  if (_token) {
    // Token-based auth
    const tokenRecord = await prisma.visaApplicationToken.findUnique({ where: { token: _token } })
    if (!tokenRecord || tokenRecord.used || new Date() > tokenRecord.expiresAt) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }
    if (tokenRecord.applicationId !== params.id) {
      return NextResponse.json({ error: 'Token does not match application' }, { status: 403 })
    }
  } else {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const existing = await prisma.visaApplication.findFirst({
      where: { id: params.id, userId: session.user.id },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const dateFields = ['dateOfBirth', 'passportIssueDate', 'passportExpiryDate', 'arrivalDate', 'returnDate']
  const data: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
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
