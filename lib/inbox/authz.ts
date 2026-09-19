/**
 * Server-side inbox RBAC (INBOX-0S.2).
 *
 * Until this release the inbox_* permissions were enforced only in the
 * browser — any authenticated staff member could call the Chatwoot proxy
 * routes directly and read, reply to, assign or resolve ANY conversation.
 * These helpers move enforcement into the API routes.
 *
 * Permission source: AdminSession.permissions (RolePermission defaults
 * merged with per-staff overrides by getAdminSession). super_admin always
 * passes — the env-fallback super admin has an empty permissions object,
 * so the role check is required, mirroring the existing client logic.
 *
 * Conversation ownership (inbox_view_all=false): a staff member may only
 * touch conversations that are unassigned or assigned to their own
 * Chatwoot agent. The staff → Chatwoot-agent resolution chain:
 *   1. RoutingAgent row (Supabase) by email
 *   2. Chatwoot agent list matched by email
 * Unknown assignee or unresolvable agent id fails CLOSED (denied).
 *
 * P1 security hotfix (2026-09-19): a third tier previously lived here — a
 * hardcoded EMAIL_TO_AGENT email→id map (app/admin/inbox/types.ts) — with
 * a comment claiming it "was removed in INBOX-0S.6". It was NOT removed;
 * it was still live and still consulted whenever tiers 1-2 failed to
 * resolve. That is a real identity-confusion path: a Chatwoot agent id is
 * a mutable, reassignable number — if a listed email's DB row and live
 * Chatwoot lookup both failed (e.g. deactivated in Chatwoot but not yet
 * in RoutingAgent) while that stale numeric id had since been given to a
 * DIFFERENT live agent, this fallback would resolve the original staff
 * member to a CURRENT STRANGER's identity and conversation access. The
 * fallback tier has been removed outright: when tiers 1-2 don't resolve,
 * resolveChatwootAgentId now returns 0 and every ownership check fails
 * closed, rather than guessing from stale hardcoded data.
 */

import type { AdminSession } from '@/lib/admin-auth'
import { adminChatwootOrNull } from '@/lib/chatwoot/config'
import { getSupabaseAdmin } from '@/lib/supabase'

export type InboxPermissionKey =
  | 'inbox_view' | 'inbox_view_all' | 'inbox_reply' | 'inbox_assign' | 'inbox_delete'
  | 'staff_create' | 'settings_integrations'

export type InboxAuthz =
  | { allowed: true }
  | { allowed: false; status: 401 | 403; error: string }

const DENY_PERMISSION: InboxAuthz = {
  allowed: false, status: 403, error: 'You do not have permission to do this.',
}
const DENY_CONVERSATION: InboxAuthz = {
  allowed: false, status: 403, error: 'You do not have access to this conversation.',
}

export function isSuperAdmin(session: AdminSession): boolean {
  return session.role === 'super_admin' || session.staffRole === 'super_admin'
}

/** Effective permission check — super_admin always passes. */
export function hasInboxPermission(session: AdminSession, key: InboxPermissionKey): boolean {
  return isSuperAdmin(session) || session.permissions?.[key] === true
}

export function hasAnyInboxPermission(session: AdminSession, keys: InboxPermissionKey[]): boolean {
  return keys.some(k => hasInboxPermission(session, k))
}

export function checkInboxPermission(session: AdminSession, key: InboxPermissionKey): InboxAuthz {
  return hasInboxPermission(session, key) ? { allowed: true } : DENY_PERMISSION
}

export function canViewAllConversations(session: AdminSession): boolean {
  return hasInboxPermission(session, 'inbox_view_all')
}

/** Pure ownership rule shared by list filtering and per-conversation checks. */
export function canAccessConversation(
  assigneeId: number | null,
  myAgentId: number,
  viewAll: boolean,
): boolean {
  if (viewAll) return true
  if (assigneeId == null) return true                    // unassigned — anyone with inbox_view
  return myAgentId > 0 && assigneeId === myAgentId       // mine
}

// ── Staff → Chatwoot agent id resolution ─────────────────────────────────────

const AGENT_ID_CACHE_MS = 2 * 60 * 1000
const agentIdCache = new Map<string, { id: number; expiresAt: number }>()

/** Test/ops helper. */
export function clearInboxAuthzCaches(): void {
  agentIdCache.clear()
  assigneeCache.clear()
}

export async function resolveChatwootAgentId(email: string): Promise<number> {
  const key = email.toLowerCase()
  const cached = agentIdCache.get(key)
  if (cached && Date.now() < cached.expiresAt) return cached.id

  let id = 0

  // 1. RoutingAgent DB mapping
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('RoutingAgent')
      .select('chatwootAgentId')
      .eq('email', key)
      .eq('active', true)
      .maybeSingle()
    if (data?.chatwootAgentId) id = Number(data.chatwootAgentId)
  } catch { /* fall through */ }

  // 2. Chatwoot agent list matched by email
  if (!id) {
    const cw = adminChatwootOrNull()
    if (cw) {
      try {
        const res = await fetch(`${cw.base}/api/v1/accounts/${cw.accountId}/agents`, {
          headers: { api_access_token: cw.token },
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const agents = await res.json() as Array<{ id: number; email?: string }>
          const match = Array.isArray(agents)
            ? agents.find(a => a.email?.toLowerCase() === key)
            : undefined
          if (match?.id) id = match.id
        }
      } catch { /* fall through */ }
    }
  }

  // 3. No further fallback (P1 security hotfix, 2026-09-19) — an identity
  // that tiers 1-2 cannot resolve fails closed (id stays 0) rather than
  // guessing from the removed EMAIL_TO_AGENT hardcoded map. See the
  // module doc comment above for why that tier was unsafe.

  agentIdCache.set(key, { id, expiresAt: Date.now() + AGENT_ID_CACHE_MS })
  return id
}

// ── Conversation assignee lookup ─────────────────────────────────────────────

// Short cache absorbs the 5s inbox poll (messages + read fire together).
const ASSIGNEE_CACHE_MS = 10 * 1000
const assigneeCache = new Map<string, { assigneeId: number | null; expiresAt: number }>()

/** null = unassigned; undefined = could not determine (treated as denied). */
export async function fetchConversationAssigneeId(
  conversationId: string,
): Promise<number | null | undefined> {
  const cached = assigneeCache.get(conversationId)
  if (cached && Date.now() < cached.expiresAt) return cached.assigneeId

  const cw = adminChatwootOrNull()
  if (!cw) return undefined
  try {
    const res = await fetch(
      `${cw.base}/api/v1/accounts/${cw.accountId}/conversations/${conversationId}`,
      { headers: { api_access_token: cw.token }, signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return undefined
    const raw = await res.json() as {
      meta?: { assignee?: { id?: number } | null }
      assignee?: { id?: number } | null
    }
    const assigneeId = raw?.meta?.assignee?.id ?? raw?.assignee?.id ?? null
    assigneeCache.set(conversationId, { assigneeId, expiresAt: Date.now() + ASSIGNEE_CACHE_MS })
    return assigneeId
  } catch {
    return undefined
  }
}

/**
 * Full per-conversation gate for [id] routes: view-all staff pass without
 * extra calls; everyone else must own the conversation or it must be
 * unassigned. Indeterminate state (Chatwoot unreachable, unknown agent)
 * denies — fail closed.
 */
export async function checkConversationAccess(
  session: AdminSession,
  conversationId: string,
): Promise<InboxAuthz> {
  if (canViewAllConversations(session)) return { allowed: true }
  const assigneeId = await fetchConversationAssigneeId(conversationId)
  if (assigneeId === undefined) return DENY_CONVERSATION
  const myAgentId = await resolveChatwootAgentId(session.email)
  return canAccessConversation(assigneeId, myAgentId, false)
    ? { allowed: true }
    : DENY_CONVERSATION
}
