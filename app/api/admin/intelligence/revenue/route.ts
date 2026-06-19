import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const type = searchParams.get('type')
  const priority = searchParams.get('priority')

  const where: Record<string, string> = {}
  if (status) where.status = status
  if (type) where.type = type
  if (priority) where.priority = priority

  const opportunities = await prisma.revenueOpportunity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ opportunities })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    userId,
    leadId,
    type,
    priority,
    title,
    description,
    estimatedValue,
    currency,
    actionRequired,
    deadline,
  } = await req.json()

  const opportunity = await prisma.revenueOpportunity.create({
    data: {
      userId: userId ?? null,
      leadId: leadId ?? null,
      type,
      priority,
      title,
      description,
      estimatedValue,
      currency: currency ?? 'GBP',
      actionRequired,
      deadline: deadline ? new Date(deadline) : null,
      status: 'open',
    },
  })

  return NextResponse.json({ opportunity })
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, assignedTo, dismissedBy } = await req.json()

  const updateData: Record<string, unknown> = {}
  if (status !== undefined) updateData.status = status
  if (assignedTo !== undefined) updateData.assignedTo = assignedTo
  if (dismissedBy !== undefined) updateData.dismissedBy = dismissedBy

  if (status === 'converted') updateData.convertedAt = new Date()
  if (status === 'dismissed') {
    updateData.dismissedAt = new Date()
    if (dismissedBy) updateData.dismissedBy = dismissedBy
  }

  const opportunity = await prisma.revenueOpportunity.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json({ opportunity })
}
