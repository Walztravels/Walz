/**
 * Walz Team Hub V1 — server-side authorization.
 *
 * Mirrors lib/inbox/authz.ts's proven shape (coarse permission check, then
 * resource-specific ownership check, fail-closed on any indeterminate
 * state) with ONE deliberate, critical divergence documented below.
 *
 * BASELINE ACCESS: every active Staff member gets Team Hub automatically —
 * there is no `team_hub_access`-style permission key. `getAdminSession()`
 * already refuses to mint a session at all for `isActive: false` staff
 * (lib/admin-auth.ts), so "a valid AdminSession exists" already means
 * "active staff member" — no separate check is needed or should be added.
 *
 * ELEVATED CAPABILITIES use the existing DB-driven RolePermission/
 * Staff.permissions system via two new keys added to lib/permissions.ts:
 *   - 'team_hub_channel_manage' — create/archive channels, manage PRIVATE
 *     channel membership.
 *   - 'team_hub_admin' — Team Hub system settings/health/audit viewing.
 *
 * CRITICAL DIVERGENCE FROM lib/inbox/authz.ts — READ THIS BEFORE CHANGING
 * ANYTHING HERE: `checkConversationAccess()` in the Inbox lets staff with
 * `inbox_view_all` bypass per-conversation ownership entirely. Team Hub
 * MUST NOT have an equivalent bypass for reading conversation CONTENT.
 * Per explicit owner decision: "Do NOT build casual Super Admin access to
 * staff private DMs... Super Admin does NOT automatically get a UI for
 * reading arbitrary private DMs." `checkConversationMembership()` below
 * therefore has ZERO role-based bypass, including for super_admin — it is
 * a plain, unconditional "is there an active membership row for this
 * (conversationId, staffId) pair" check, full stop. `team_hub_admin`
 * governs ADMINISTRATIVE actions only (see `checkTeamHubAdminAction()`)
 * and must never be used as a substitute for a membership check on message
 * content. If a genuine exceptional-access need is ever real, it is
 * explicitly OUT OF SCOPE for V1 per the owner's own instruction — do not
 * add one speculatively.
 */

import type { AdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export type TeamAuthz =
  | { allowed: true }
  | { allowed: false; status: 401 | 403 | 404; error: string }

const DENY_PERMISSION: TeamAuthz = {
  allowed: false, status: 403, error: 'You do not have permission to do this.',
}
const DENY_MEMBERSHIP: TeamAuthz = {
  allowed: false, status: 403, error: 'You do not have access to this conversation.',
}
const DENY_NOT_FOUND: TeamAuthz = {
  allowed: false, status: 404, error: 'Conversation not found.',
}

/** The canonical Staff.id for the current session — the one identifier every Team Hub row keys off. */
export function currentStaffId(session: AdminSession): string {
  return session.staffId ?? session.id
}

export function isSuperAdmin(session: AdminSession): boolean {
  return session.role === 'super_admin' || session.staffRole === 'super_admin'
}

/**
 * Elevated, ADMINISTRATIVE actions only (create/archive channel, manage
 * private membership, settings, audit). Never a substitute for a
 * membership check on message content. Mirrors lib/inbox/authz.ts's own
 * `hasInboxPermission` shape exactly: super_admin bypass, else a direct
 * read of the session's own merged fine-grained permissions object
 * (never the coarse nav-only Permission system in lib/admin/permissions.ts).
 */
export function checkTeamHubAdminAction(
  session: AdminSession,
  key: 'team_hub_channel_manage' | 'team_hub_admin',
): TeamAuthz {
  if (isSuperAdmin(session)) return { allowed: true }
  return session.permissions?.[key] === true ? { allowed: true } : DENY_PERMISSION
}

export interface ConversationMembershipRow {
  id: string
  conversationId: string
  staffId: string
  role: string
  lastReadMessageId: string | null
  lastReadAt: Date | null
  leftAt: Date | null
}

/**
 * THE membership gate. No role-based bypass, ever (see file header). Fails
 * closed on any error — never guesses, never throws past this boundary.
 * Returns the actual membership row on success so callers don't need a
 * second query for role/read-cursor.
 */
export async function checkConversationMembership(
  session: AdminSession,
  conversationId: string,
): Promise<TeamAuthz & { member?: ConversationMembershipRow }> {
  try {
    const conversation = await prisma.teamConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, archived: true },
    })
    if (!conversation) return DENY_NOT_FOUND

    const member = await prisma.teamConversationMember.findFirst({
      where: { conversationId, staffId: currentStaffId(session), leftAt: null },
    })
    if (!member) return DENY_MEMBERSHIP

    return { allowed: true, member }
  } catch (e) {
    console.warn('[team/authz] membership check failed — denying:', e)
    return DENY_MEMBERSHIP
  }
}

/** Channel-membership-management authorization (owner decision 5): creator/admin-of-this-conversation, or a Team-Hub-wide channel manager/admin. */
export async function checkCanManageMembership(
  session: AdminSession,
  conversationId: string,
): Promise<TeamAuthz> {
  if (checkTeamHubAdminAction(session, 'team_hub_channel_manage').allowed) return { allowed: true }
  const membership = await checkConversationMembership(session, conversationId)
  if (!membership.allowed) return membership
  if (membership.member?.role === 'admin') return { allowed: true }
  return DENY_PERMISSION
}

/**
 * Message edit/delete authorization (owner decisions 6-7): the author may
 * always edit/delete their own message; a Team Hub administrator may
 * delete (never edit) someone else's message as content moderation, which
 * callers must additionally log to ActivityLog.
 */
export function canEditMessage(session: AdminSession, authorId: string): boolean {
  return currentStaffId(session) === authorId
}
export function canDeleteMessage(session: AdminSession, authorId: string): 'author' | 'admin' | null {
  if (currentStaffId(session) === authorId) return 'author'
  if (checkTeamHubAdminAction(session, 'team_hub_admin').allowed) return 'admin'
  return null
}

/** Deterministic, sorted-pair DM key — the database-level DM-uniqueness constraint's input. */
export function computeDmKey(staffIdA: string, staffIdB: string): string {
  return [staffIdA, staffIdB].sort().join(':')
}
