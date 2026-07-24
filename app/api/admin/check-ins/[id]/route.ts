import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

const ADMIN_ROLES = new Set(['super_admin', 'operations_manager'])

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body   = await req.json() as { action: 'waive' | 'dispute' | 'resolve'; note?: string; approved?: boolean }

    const record = await prisma.checkInRecord.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (body.action === 'waive') {
      if (!ADMIN_ROLES.has(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const updated = await prisma.checkInRecord.update({
        where: { id },
        data: {
          waived:      true,
          flagged:     false,
          deductionAmt: 0,
          waivedById:  session.staffId,
          waivedAt:    new Date(),
        },
      })
      return NextResponse.json({ record: updated })
    }

    if (body.action === 'dispute') {
      if (record.staffId !== session.staffId && !ADMIN_ROLES.has(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const updated = await prisma.checkInRecord.update({
        where: { id },
        data: { dispute: body.note ?? '', disputeStatus: 'pending' },
      })
      return NextResponse.json({ record: updated })
    }

    if (body.action === 'resolve') {
      if (!ADMIN_ROLES.has(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const approved = body.approved ?? false
      const updated  = await prisma.checkInRecord.update({
        where: { id },
        data: {
          disputeStatus: approved ? 'approved' : 'rejected',
          ...(approved ? { waived: true, flagged: false, deductionAmt: 0, waivedById: session.staffId, waivedAt: new Date() } : {}),
        },
      })
      return NextResponse.json({ record: updated })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[check-in PATCH]', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
