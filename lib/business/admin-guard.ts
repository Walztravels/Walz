// lib/business/admin-guard.ts — Walz Business (Release 2)
//
// Staff-side guard shared by every app/api/admin/business/organizations/[id]/**
// route added in R2. Exactly the same checks the R1 admin routes perform
// inline (getAdminSession -> 401, hasPermission -> 403), plus a fresh
// Organization existence read so every org-scoped admin endpoint 404s on an
// unknown org id instead of returning an empty list that looks valid.
//
// Staff are platform-wide operators (not org members), so the tenant
// boundary for admin routes is the SUB-RESOURCE check: every nested
// resource id in the URL (requestId, serviceId, travellerId, membershipId)
// must be re-verified server-side to belong to the URL's organization id
// before it is read or mutated. Each route does that explicitly.

import { NextResponse } from 'next/server'
import { getAdminSession, type AdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'

type Perm = 'b2b' | 'b2b.manage'

export type StaffGuardResult =
  | { ok: true; session: AdminSession }
  | { ok: false; response: NextResponse }

export async function requireB2bStaff(permission: Perm): Promise<StaffGuardResult> {
  const session = await getAdminSession()
  if (!session) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasPermission(session, permission)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session }
}

export async function organizationExists(organizationId: string): Promise<boolean> {
  if (!organizationId) return false
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } })
  return !!org
}

export function staffActorId(session: AdminSession): string {
  return session.staffId ?? session.email
}

export const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return null
  }
}

export function requiredReason(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 2000) : null
}
