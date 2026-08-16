import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { sendWhatsAppBody, normalisePhone } from '@/lib/twilio-whatsapp'
import { ROLE_HIERARCHY } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// Active visa statuses — used here and re-exported for the inbound webhook.
export const ACTIVE_VISA_STATUSES = [
  'received', 'documents_pending', 'info_required', 'under_review',
  'ready_to_submit', 'submitted_to_embassy', 'decision_pending',
]

// Returns [viewerId, ...ids of all staff strictly below the viewer's rank]
async function getVisibleStaffIds(viewerRole: string, viewerId: string): Promise<string[]> {
  const viewerRank  = (ROLE_HIERARCHY as string[]).indexOf(viewerRole)
  const visibleRoles = (ROLE_HIERARCHY as string[]).filter((_, i) => i < viewerRank)
  const staff = await prisma.staff.findMany({
    where:  { role: { in: visibleRoles } },
    select: { id: true },
  })
  return [viewerId, ...staff.map(s => s.id)]
}

// GET — fetch messages for a visa application (role-gated)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const visibleIds = await getVisibleStaffIds(session.staffRole, session.id)

  // Application must be assigned to someone in the viewer's visible set
  const app = await prisma.visaApplication.findFirst({
    where: {
      id:         params.id,
      assignedTo: { in: visibleIds },
    },
    select: { id: true, phone: true, firstName: true, lastName: true, assignedTo: true },
  })

  if (!app) return NextResponse.json({ error: 'Not found or access denied' }, { status: 404 })

  const messages = await prisma.visaApplicationMessage.findMany({
    where:   { visaApplicationId: params.id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ messages })
}

// POST — send an outbound WhatsApp message (role-gated, writes VisaApplicationMessage)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { message?: string }
  if (!body.message?.trim()) return NextResponse.json({ error: 'message is required' }, { status: 400 })

  const visibleIds = await getVisibleStaffIds(session.staffRole, session.id)

  const app = await prisma.visaApplication.findFirst({
    where: {
      id:         params.id,
      assignedTo: { in: visibleIds },
    },
    select: { id: true, phone: true, firstName: true, lastName: true },
  })

  if (!app) return NextResponse.json({ error: 'Not found or access denied' }, { status: 404 })
  if (!app.phone) return NextResponse.json({ error: "No phone number on this application" }, { status: 422 })

  const result = await sendWhatsAppBody(normalisePhone(app.phone), body.message.trim())

  const msg = await prisma.visaApplicationMessage.create({
    data: {
      visaApplicationId: params.id,
      direction:         'outbound',
      body:              body.message.trim(),
      sentBy:            session.id,
      status:            result.ok ? 'sent' : 'failed',
      twilioSid:         result.sid ?? null,
    },
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error, msg }, { status: 502 })
  }

  return NextResponse.json({ msg })
}
