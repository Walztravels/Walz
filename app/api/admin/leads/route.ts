import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'

// GET /api/admin/leads — list all leads with optional filters
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status        = searchParams.get('status')
  const service       = searchParams.get('service')
  const source        = searchParams.get('source')
  const importBatchId = searchParams.get('importBatchId')
  const page          = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize      = 50

  const where: Record<string, unknown> = {}
  if (status)        where.status        = status
  if (service)       where.service       = service
  if (importBatchId) where.importBatchId = importBatchId
  if (source) {
    if (source === 'organic') {
      where.source = { notIn: ['csv_import', 'sleekflow_import', 'zendesk_import'] }
    } else {
      where.source = source
    }
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.lead.count({ where }),
  ])

  return NextResponse.json({ leads, total, page, pageSize })
}

// POST /api/admin/leads — create a new lead
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { name, email, phone, source, details, service, notes } = body as Record<string, string>
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const lead = await prisma.lead.create({
    data: {
      name,
      email:    email   || undefined,
      whatsapp: phone   || undefined,
      source:   source  || 'admin',
      service:  service || 'Other',
      details:  notes || details || undefined,
    },
  })
  return NextResponse.json({ lead })
}

// PATCH /api/admin/leads — update lead status
const patchSchema = z.object({
  id:     z.string().cuid(),
  status: z.enum(['New', 'Contacted', 'Deposit Paid', 'In Progress', 'Closed']),
})

export async function PATCH(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 })
  }

  const lead = await prisma.lead.update({
    where: { id: parsed.data.id },
    data:  { status: parsed.data.status },
  })

  return NextResponse.json({ success: true, lead })
}
