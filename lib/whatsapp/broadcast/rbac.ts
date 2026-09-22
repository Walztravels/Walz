/**
 * WhatsApp Broadcast V1 — the one permission gate for every broadcast route.
 *
 * NO NEW PERMISSION SCHEME. `marketing_whatsapp_broadcast` already existed
 * in this codebase before this feature — declared in lib/permissions.ts
 * (PermissionKey union, EMPTY_PERMISSIONS, the role matrix and the role
 * editor) and in lib/permissions-registry.ts with the label "WhatsApp
 * Broadcast" and the description "Send WhatsApp broadcast messages to
 * client lists". It was simply never ENFORCED: the pre-existing broadcast
 * route checked only getAdminSession(), so any authenticated admin could
 * write broadcast rows regardless of role.
 *
 * Every route in this feature now goes through requireBroadcastAccess(),
 * which uses the same `can()` helper the rest of /api/admin/marketing/**
 * uses (see marketing/posts, marketing/media, marketing/publish). `can()`
 * grants super_admin unconditionally and otherwise requires the merged
 * role+override permission to be exactly true — fail-closed.
 */

import { NextResponse } from 'next/server'
import { getAdminSession, type AdminSession } from '@/lib/admin-auth'
import { can } from '@/lib/permissions-registry'

export const BROADCAST_PERMISSION = 'marketing_whatsapp_broadcast'

export type BroadcastAccess =
  | { ok: true; session: AdminSession }
  | { ok: false; response: NextResponse }

/**
 * Resolve the admin session and enforce the broadcast permission.
 * Used identically by every GET, POST and PATCH this feature adds —
 * including the readiness probe, which reports on secrets and must not be
 * readable by an arbitrary logged-in staff member.
 */
export async function requireBroadcastAccess(): Promise<BroadcastAccess> {
  const session = await getAdminSession()
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  }
  if (!can(session, BROADCAST_PERMISSION)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'WhatsApp Broadcast permission required. Contact your admin.' },
        { status: 403 },
      ),
    }
  }
  return { ok: true, session }
}
