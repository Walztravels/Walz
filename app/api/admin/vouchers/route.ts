import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { z } from 'zod'

const voucherSchema = z.object({
  name:         z.string().min(1),
  voucherKind:  z.enum(['gift', 'credit']).default('credit'),
  serviceType:  z.enum(['visa', 'flight', 'tour', 'all']).default('all'),
  discountType: z.enum(['fixed', 'percentage', 'free']).default('fixed'),
  amount:       z.number().min(0),
  currency:     z.enum(['GBP', 'USD', 'CAD', 'NGN', 'AED']).default('GBP'),
  maxUses:      z.number().int().min(1).default(1),
  active:       z.boolean().default(true),
  tourName:     z.string().optional().nullable(),
  validFrom:    z.string().optional(),
  expiresAt:    z.string(),
  // Gift-specific (admin creating on behalf of someone)
  senderName:    z.string().optional().nullable(),
  senderEmail:   z.string().email().optional().nullable().or(z.literal('')),
  recipientName:  z.string().optional().nullable(),
  recipientEmail: z.string().email().optional().nullable().or(z.literal('')),
  personalMessage: z.string().optional().nullable(),
})

function generateAdminCode(serviceType: string): string {
  const prefixMap: Record<string, string> = {
    visa: 'VISA', flight: 'FLT', tour: 'TOUR', all: 'DISC',
  }
  const prefix = prefixMap[serviceType] ?? 'DISC'
  const random = Math.random().toString(36).substring(2, 10).toUpperCase()
  return `WALZ-${prefix}-${random}`
}

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status')  ?? ''
  const kind     = searchParams.get('kind')    ?? ''
  const search   = searchParams.get('search')  ?? ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (status && status !== 'all') where.status = status.toUpperCase()
  if (kind   && kind   !== 'all') where.voucherKind = kind
  if (search) {
    where.OR = [
      { code:          { contains: search, mode: 'insensitive' } },
      { name:          { contains: search, mode: 'insensitive' } },
      { senderName:    { contains: search, mode: 'insensitive' } },
      { recipientName: { contains: search, mode: 'insensitive' } },
      { senderEmail:   { contains: search, mode: 'insensitive' } },
      { recipientEmail:{ contains: search, mode: 'insensitive' } },
    ]
  }

  const vouchers = await prisma.voucher.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(vouchers)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = voucherSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const d = parsed.data

  let code = generateAdminCode(d.serviceType)
  let attempts = 0
  while (attempts < 5) {
    const exists = await prisma.voucher.findUnique({ where: { code } })
    if (!exists) break
    code = generateAdminCode(d.serviceType)
    attempts++
  }

  const voucher = await prisma.voucher.create({
    data: {
      code,
      name:          d.name,
      voucherKind:   d.voucherKind,
      serviceType:   d.serviceType,
      discountType:  d.discountType,
      amount:        d.amount,
      currency:      d.currency,
      remainingAmount: d.amount,
      maxUses:       d.maxUses,
      active:        d.active,
      tourName:      d.tourName ?? null,
      validFrom:     d.validFrom ? new Date(d.validFrom) : new Date(),
      expiresAt:     new Date(d.expiresAt),
      status:        'ACTIVE',
      senderName:    d.senderName ?? null,
      senderEmail:   d.senderEmail || null,
      recipientName:  d.recipientName ?? null,
      recipientEmail: d.recipientEmail || null,
      personalMessage: d.personalMessage ?? null,
    },
  })

  return NextResponse.json(voucher, { status: 201 })
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { id, ...rest } = body ?? {}
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const parsed = voucherSchema.partial().safeParse(rest)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const d = parsed.data
  const updateData: Record<string, unknown> = { ...d }
  if (d.validFrom)  updateData.validFrom  = new Date(d.validFrom as string)
  if (d.expiresAt)  updateData.expiresAt  = new Date(d.expiresAt as string)
  if (d.amount !== undefined) updateData.remainingAmount = d.amount

  // Sync status based on active flag
  const existing = await prisma.voucher.findUnique({ where: { id } })
  if (existing && d.active === false && existing.status === 'ACTIVE') {
    updateData.status = 'CANCELLED'
  }
  if (existing && d.active === true && existing.status === 'CANCELLED') {
    updateData.status = 'ACTIVE'
  }

  const voucher = await prisma.voucher.update({ where: { id }, data: updateData })
  return NextResponse.json(voucher)
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.voucher.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
