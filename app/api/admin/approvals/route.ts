import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'

// GET — list approvals (pending for resolvers, own requests for others)
export async function GET(_req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canResolve = hasPermission(session, 'approvals.resolve')

  const where = canResolve
    ? session.role === 'super_admin' ? {} : { branch: session.branch }
    : { requestedBy: session.email }

  const approvals = await prisma.approvalRequest.findMany({
    where,
    orderBy: { requestedAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ approvals })
}

// POST — create approval request
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, entityId, entityType, amount, currency, reason } = await req.json()

  if (!type || !entityId || !entityType || !reason) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const approval = await prisma.approvalRequest.create({
    data: {
      type,
      entityId,
      entityType,
      amount:      amount ?? null,
      currency:    currency ?? null,
      reason,
      requestedBy: session.email,
      branch:      session.branch ?? 'nigeria',
    },
  })

  await prisma.activityLog.create({
    data: {
      staffId:     session.id,
      staffName:   session.name,
      staffRole:   session.role,
      staffBranch: session.branch,
      action:      'approval_requested',
      module:      'approvals',
      entityId:    approval.id,
      entityType:  'approval',
      detail:      `${type} request for ${entityType} ${entityId}: ${reason}`,
    },
  })

  return NextResponse.json({ approval })
}

// PATCH — resolve approval (approve/reject)
export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasPermission(session, 'approvals.resolve')) {
    return NextResponse.json({ error: 'Forbidden — approvals.resolve required' }, { status: 403 })
  }

  const { id, status, notes } = await req.json()

  if (!id || !status || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'id and status (approved|rejected) are required' }, { status: 400 })
  }

  const approval = await prisma.approvalRequest.update({
    where: { id },
    data: {
      status,
      approvedBy: session.email,
      resolvedAt: new Date(),
      notes:      notes ?? null,
    },
  })

  await prisma.activityLog.create({
    data: {
      staffId:     session.id,
      staffName:   session.name,
      staffRole:   session.role,
      action:      `approval_${status}`,
      module:      'approvals',
      entityId:    approval.id,
      detail:      `${approval.type} request ${status} by ${session.email}`,
    },
  })

  return NextResponse.json({ approval })
}
