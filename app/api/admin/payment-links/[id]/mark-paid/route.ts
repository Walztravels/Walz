import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { prisma }                    from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!session.permissions?.payments_create && !session.permissions?.payments_edit && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied', required: 'payments_create' }, { status: 403 })
    }

    await prisma.paymentLink.update({
      where: { id: params.id },
      data:  { status: 'paid', paidAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[payment-links/mark-paid]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
