import { NextRequest, NextResponse } from 'next/server'
import { z }                        from 'zod'
import { prisma }                   from '@/lib/db'
import { getAdminSession }          from '@/lib/admin-auth'

const MANAGER_ROLES = new Set(['super_admin', 'manager', 'admin', 'accounts'])

const patchSchema = z.object({
  nextFollowUpAt: z.string().datetime({ offset: true }).optional().nullable(),
  followUpNote:   z.string().max(2000).optional().nullable(),
  interestLevel:  z.enum(['hot', 'warm', 'cold']).optional().nullable(),
  // Optional status bump (e.g. Contacted → triggers follow-up date requirement)
  status:         z.enum(['New', 'Contacted', 'Deposit Paid', 'In Progress', 'Closed']).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const leadId = params.id

  // Non-managers may only edit leads assigned to themselves
  const isManager = MANAGER_ROLES.has(session.role)
  if (!isManager) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true } })
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (lead.assignedToId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const { nextFollowUpAt, followUpNote, interestLevel, status } = parsed.data

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data:  {
      ...(nextFollowUpAt !== undefined ? { nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null } : {}),
      ...(followUpNote   !== undefined ? { followUpNote }   : {}),
      ...(interestLevel  !== undefined ? { interestLevel }  : {}),
      ...(status         !== undefined ? { status }         : {}),
      lastContactedAt: new Date(),
      followUpCount:   { increment: 1 },
    },
  })

  return NextResponse.json({ success: true, lead })
}
