import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const body = await req.json()
  const { status, paidAt } = body

  const allowed = ['PENDING', 'EMAILED', 'PAID', 'CANCELLED']
  if (status && !allowed.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const payslip = await prisma.payslip.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(paidAt  ? { paidAt: new Date(paidAt) } : {}),
      ...(status === 'PAID' && !paidAt ? { paidAt: new Date() } : {}),
    },
  })

  return NextResponse.json({ payslip })
}
