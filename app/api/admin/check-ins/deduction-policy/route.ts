// GET/PUT /api/admin/check-ins/deduction-policy — Super-Admin-only
// configuration of the per-country missed-check-in deduction amount
// (mission brief §5/§13). A country's `amount` may be NULL, meaning
// deductions for that country are financially inert (no CheckInDeduction is
// ever created) until a Super Admin sets a real number here. Never guessed
// by this route or anywhere else.
import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

type AdminSession = NonNullable<Awaited<ReturnType<typeof getAdminSession>>>

interface SuperAdminAuthResult {
  session?: AdminSession
  error?:   NextResponse
}

async function requireSuperAdmin(): Promise<SuperAdminAuthResult> {
  const session = await getAdminSession()
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (session.role !== 'super_admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session }
}

export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const policies = await (prisma as any).checkInDeductionPolicy.findMany({ orderBy: { country: 'asc' } })
  return NextResponse.json({ policies })
}

export async function PUT(req: Request) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const body = await req.json() as { country?: string; amount?: number | null; enabled?: boolean }
  const country = (body.country ?? '').toUpperCase()
  if (country !== 'NG' && country !== 'GH') {
    return NextResponse.json({ error: 'Unknown country — only NG and GH policies exist today' }, { status: 400 })
  }
  if (body.amount !== null && body.amount !== undefined && (typeof body.amount !== 'number' || body.amount < 0)) {
    return NextResponse.json({ error: 'amount must be a non-negative number or null' }, { status: 400 })
  }

  const updated = await (prisma as any).checkInDeductionPolicy.update({
    where: { country },
    data: {
      ...(body.amount !== undefined ? { amount: body.amount } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      updatedBy: auth.session!.staffId ?? null,
    },
  })

  return NextResponse.json({ policy: updated })
}
