/**
 * Staff Performance Management — authorization gate.
 *
 * This is sensitive HR/legal-adjacent information. Per the mission brief
 * (§12) and the standing "err toward MORE restriction" mandate, EVERY
 * performance-management read/write is restricted to staffRole ===
 * 'super_admin'. No existing RBAC permission key in this codebase
 * (lib/permissions.ts) distinguishes "may view performance data" from any
 * other capability, and department names are never used to infer
 * authorization (per the brief's explicit instruction) — so managers do
 * not get read access unless/until the business defines and wires a real
 * permission key for it. The only exception is a staff member's own
 * issued notices (requireSelf below), matching the existing
 * `staffId: session.id` pattern used by /api/admin/notifications.
 *
 * This mirrors the existing local-`requireSuperAdmin()` pattern already
 * used elsewhere in this codebase (e.g. app/api/admin/settings/fx/route.ts)
 * rather than inventing a new shared RBAC primitive.
 */

import { NextResponse } from 'next/server'
import { getAdminSession, type AdminSession } from '@/lib/admin-auth'

export type AuthzResult =
  | { ok: true; session: AdminSession }
  | { ok: false; error: NextResponse }

export async function requireSuperAdmin(): Promise<AuthzResult> {
  const session = await getAdminSession()
  if (!session) {
    return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (session.staffRole !== 'super_admin') {
    return { ok: false, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session }
}

/**
 * For staff-self-service endpoints ("My Performance Notices"). Any
 * authenticated staff member may call these, but every handler MUST then
 * additionally filter/verify by `session.id` (never accept a staffId or
 * documentId from the request as the identity check — see each route's
 * own ownership check, which prevents IDOR by re-deriving staffId from
 * the resolved document row, not from client input).
 */
export async function requireAuthenticatedStaff(): Promise<AuthzResult> {
  const session = await getAdminSession()
  if (!session) {
    return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true, session }
}
