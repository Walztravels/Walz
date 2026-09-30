// app/api/admin/business/organizations/[id]/audit/route.ts — Walz Business (R2)
// GET — ONE organization's BusinessAuditLog, newest first. Requires 'b2b'.
//
// READ-ONLY / APPEND-ONLY: this file exports GET only. There is no route
// anywhere in this domain that updates or deletes a business_audit_log row;
// lib/business/audit.ts::recordBusinessAudit() is the sole writer (INSERT
// only). Paginated with an opaque `before` cursor (createdAt ISO string).

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireB2bStaff, organizationExists, NOT_FOUND } from '@/lib/business/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireB2bStaff('b2b')
  if (!guard.ok) return guard.response
  if (!(await organizationExists(params.id))) return NOT_FOUND()

  const limitRaw = Number(req.nextUrl?.searchParams?.get('limit') ?? 100)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 100
  const beforeRaw = req.nextUrl?.searchParams?.get('before')
  const before = beforeRaw ? new Date(beforeRaw) : null

  const rows = await prisma.businessAuditLog.findMany({
    where: {
      organizationId: params.id,
      ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const userIds = Array.from(new Set(rows.map(r => r.actorUserId).filter((v): v is string => !!v)))
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : []
  const userLabel = new Map(users.map(u => [u.id, u.name ? `${u.name} (${u.email ?? 'no email'})` : u.email ?? u.id]))

  return NextResponse.json({
    entries: rows.map(r => ({
      id: r.id,
      at: r.createdAt,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorType: r.actorStaffId ? 'staff' : r.actorUserId ? 'member' : 'system',
      actor: r.actorStaffId ?? (r.actorUserId ? userLabel.get(r.actorUserId) ?? r.actorUserId : 'System'),
      before: r.before,
      after: r.after,
    })),
    nextBefore: rows.length === limit ? rows[rows.length - 1].createdAt : null,
  })
}
