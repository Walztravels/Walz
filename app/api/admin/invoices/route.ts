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

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const count = await prisma.invoice.count({
    where: { invoiceNumber: { startsWith: `WALZ-INV-${year}` } },
  })
  return `WALZ-INV-${year}-${String(count + 1).padStart(4, '0')}`
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const status = searchParams.get('status') ?? ''

  const [invoices, stats] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        ...(search ? {
          OR: [
            { clientName: { contains: search, mode: 'insensitive' } },
            { clientEmail: { contains: search, mode: 'insensitive' } },
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invoice.aggregate({
      _sum: { totalAmount: true, paidAmount: true },
      _count: true,
    }),
  ])

  return NextResponse.json({ invoices, stats })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await req.json()
  const items = (data.items || []) as LineItem[]
  const subtotal = items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0)
  const taxAmount = subtotal * (data.taxRate || 0) / 100
  const discountAmount = data.discountAmount || 0
  const totalAmount = subtotal + taxAmount - discountAmount
  const balanceDue = totalAmount - (data.depositAmount || 0)

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: await nextInvoiceNumber(),
      tripId: data.tripId || null,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      clientPhone: data.clientPhone,
      staffId: session.id,
      staffName: session.name,
      items: data.items || [],
      subtotal,
      taxRate: data.taxRate || 0,
      taxAmount,
      discountAmount,
      totalAmount,
      depositAmount: data.depositAmount || 0,
      balanceDue,
      currency: data.currency || 'GBP',
      status: 'draft',
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      notes: data.notes,
      internalNotes: data.internalNotes,
    },
  })

  return NextResponse.json({ invoice })
}
