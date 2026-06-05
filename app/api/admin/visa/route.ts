import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { z } from 'zod'

const visaSchema = z.object({
  country: z.string().min(2),
  flag: z.string().optional(),
  visaType: z.string().min(2),
  processingTime: z.string().min(1),
  fee: z.number().positive(),
  currency: z.string().default('GBP'),
  requirements: z.string().default('[]'),
  imageUrl: z.string().url().optional().or(z.literal('')),
  active: z.boolean().default(true),
})

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const services = await prisma.visaService.findMany({ orderBy: { country: 'asc' } })
  return NextResponse.json(services)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const parsed = visaSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }
  const service = await prisma.visaService.create({ data: parsed.data })
  return NextResponse.json(service, { status: 201 })
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const { id, ...rest } = body ?? {}
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const parsed = visaSchema.partial().safeParse(rest)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }
  const service = await prisma.visaService.update({ where: { id }, data: parsed.data })
  return NextResponse.json(service)
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.visaService.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
