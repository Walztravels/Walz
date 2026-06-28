import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { can }                       from '@/lib/permissions-registry'
import { prisma }                    from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const settings = await prisma.payrollSettings.upsert({
    where:  { id: 'singleton' },
    create: { id: 'singleton', autoRunEnabled: false },
    update: {},
  })

  return NextResponse.json(settings)
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (session.role !== 'super_admin' && !can(session, 'payroll_run') && !can(session, 'payroll_manage_settings')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.autoRunEnabled !== 'boolean') {
    return NextResponse.json({ error: 'autoRunEnabled must be a boolean' }, { status: 400 })
  }

  const settings = await prisma.payrollSettings.upsert({
    where:  { id: 'singleton' },
    create: { id: 'singleton', autoRunEnabled: body.autoRunEnabled },
    update: { autoRunEnabled: body.autoRunEnabled },
  })

  console.log(`[Payroll] Auto-run ${body.autoRunEnabled ? 'ENABLED' : 'DISABLED'} by ${session.email}`)

  return NextResponse.json(settings)
}
