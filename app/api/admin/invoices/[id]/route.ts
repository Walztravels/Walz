import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
  category?: string
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ invoice })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const data = await req.json()

  // Recalculate totals if items changed
  let totals = {}
  if (data.items) {
    const items = data.items as LineItem[]
    const subtotal = items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0)
    const taxRate = data.taxRate ?? 0
    const taxAmount = subtotal * taxRate / 100
    const discountAmount = data.discountAmount ?? 0
    const totalAmount = subtotal + taxAmount - discountAmount
    const depositAmount = data.depositAmount ?? 0
    const balanceDue = totalAmount - depositAmount
    totals = { subtotal, taxAmount, totalAmount, balanceDue }
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      ...data,
      ...totals,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      paidAt: data.paidAt ? new Date(data.paidAt) : undefined,
    },
  })
  return NextResponse.json({ invoice })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.invoice.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
