/**
 * INBOX-0S.2 — Server-side inbox RBAC.
 *
 * Before this release the inbox_* permissions existed only in the client:
 * any authenticated staff member could call the Chatwoot proxy routes
 * directly and read/reply/assign/resolve/delete ANY conversation, and any
 * session could create Chatwoot agents. These tests pin the server-side
 * enforcement and the ownership rule.
 */

import fs from 'fs'
import path from 'path'

import {
  hasInboxPermission, hasAnyInboxPermission, checkInboxPermission,
  canViewAllConversations, canAccessConversation, isSuperAdmin,
} from '@/lib/inbox/authz'
import type { AdminSession } from '@/lib/admin-auth'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const sess = (over: Partial<AdminSession>): AdminSession => ({
  id: 's1', email: 'staff@walztravels.com', name: 'Staff', roleTitle: 'Consultant',
  sendingEmail: 'bookings@walztravels.com', signatureTagline: null,
  role: 'sales_rep', staffRole: 'sales_rep', permissions: {},
  branch: 'nigeria', department: 'general', isActive: true,
  ...over,
})

describe('permission checks', () => {
  it('denies by default — no permission grants nothing', () => {
    const s = sess({})
    expect(hasInboxPermission(s, 'inbox_view')).toBe(false)
    expect(hasInboxPermission(s, 'inbox_reply')).toBe(false)
    expect(hasInboxPermission(s, 'inbox_assign')).toBe(false)
    expect(hasInboxPermission(s, 'inbox_delete')).toBe(false)
    expect(checkInboxPermission(s, 'inbox_view')).toEqual(
      { allowed: false, status: 403, error: 'You do not have permission to do this.' })
  })

  it('grants exactly the permission set on the session', () => {
    const s = sess({ permissions: { inbox_view: true, inbox_reply: true } })
    expect(hasInboxPermission(s, 'inbox_view')).toBe(true)
    expect(hasInboxPermission(s, 'inbox_reply')).toBe(true)
    expect(hasInboxPermission(s, 'inbox_assign')).toBe(false)
    expect(checkInboxPermission(s, 'inbox_reply')).toEqual({ allowed: true })
  })

  it('super_admin always passes — including the env-fallback admin with empty permissions', () => {
    const envAdmin = sess({ role: 'super_admin', staffRole: 'super_admin', permissions: {} })
    expect(isSuperAdmin(envAdmin)).toBe(true)
    for (const k of ['inbox_view', 'inbox_view_all', 'inbox_reply', 'inbox_assign', 'inbox_delete'] as const) {
      expect(hasInboxPermission(envAdmin, k)).toBe(true)
    }
  })

  it('truthy-but-not-true permission values do not grant (fail closed)', () => {
    const s = sess({ permissions: { inbox_view: 1 as unknown as boolean } })
    expect(hasInboxPermission(s, 'inbox_view')).toBe(false)
  })

  it('hasAnyInboxPermission grants when any key is held', () => {
    const s = sess({ permissions: { settings_integrations: true } })
    expect(hasAnyInboxPermission(s, ['inbox_assign', 'settings_integrations'])).toBe(true)
    expect(hasAnyInboxPermission(s, ['inbox_assign', 'inbox_delete'])).toBe(false)
  })
})

describe('conversation ownership rule', () => {
  it('view-all staff can access everything', () => {
    expect(canAccessConversation(99, 0, true)).toBe(true)
    expect(canViewAllConversations(sess({ permissions: { inbox_view_all: true } }))).toBe(true)
    expect(canViewAllConversations(sess({ role: 'super_admin', staffRole: 'super_admin' }))).toBe(true)
    expect(canViewAllConversations(sess({}))).toBe(false)
  })

  it('without view-all: unassigned + own conversations only', () => {
    expect(canAccessConversation(null, 8, false)).toBe(true)    // unassigned
    expect(canAccessConversation(8, 8, false)).toBe(true)       // mine
    expect(canAccessConversation(3, 8, false)).toBe(false)      // someone else's
  })

  it('unresolvable agent id (0) never matches an assignee — fail closed', () => {
    expect(canAccessConversation(0 as unknown as number, 0, false)).toBe(false)
    expect(canAccessConversation(5, 0, false)).toBe(false)
    expect(canAccessConversation(null, 0, false)).toBe(true)    // unassigned still visible
  })
})

describe('route wiring — authorization matrix', () => {
  const CASES: Array<[string, string[]]> = [
    ['app/api/admin/conversations/route.ts',                 ["'inbox_view'", 'canViewAllConversations', 'resolveChatwootAgentId', 'canAccessConversation']],
    ['app/api/admin/conversations/[id]/route.ts',            ["'inbox_view'", "'inbox_delete'", 'checkConversationAccess']],
    ['app/api/admin/conversations/[id]/messages/route.ts',   ["'inbox_view'", 'checkConversationAccess']],
    ['app/api/admin/conversations/[id]/reply/route.ts',      ["'inbox_reply'", 'checkConversationAccess']],
    ['app/api/admin/conversations/[id]/read/route.ts',       ["'inbox_view'", 'checkConversationAccess']],
    ['app/api/admin/conversations/[id]/resolve/route.ts',    ["'inbox_reply'", 'checkConversationAccess']],
    ['app/api/admin/conversations/[id]/assign/route.ts',     ["'inbox_assign'", 'checkConversationAccess']],
    ['app/api/admin/agents/route.ts',                        ["'inbox_view'", 'isSuperAdmin(session)']],
    ['app/api/admin/whatsapp-chat/route.ts',                 ["'inbox_view'", "'inbox_reply'"]],
  ]
  it.each(CASES)('%s enforces its permissions server-side', (file, needles) => {
    const s = read(file)
    expect(s).toContain("from '@/lib/inbox/authz'")
    for (const n of needles) expect(s).toContain(n)
  })

  it('every gated handler still authenticates first (401 before 403)', () => {
    for (const [file] of CASES) {
      const s = read(file)
      expect(s.indexOf("{ status: 401 }")).toBeGreaterThan(-1)
      expect(s.indexOf("{ status: 401 }")).toBeLessThan(s.indexOf('checkInboxPermission(session'))
    }
  })

  it('agent creation is super_admin only — staff_create alone is NOT sufficient', () => {
    const s = read('app/api/admin/agents/route.ts')
    const post = s.slice(s.indexOf('export async function POST'))
    expect(post).toContain('isSuperAdmin(session)')
    expect(post).not.toContain("'staff_create'")
    // The gate is the role check itself: a manager holding staff_create (and
    // every inbox permission) but not the super_admin role must be refused.
    const manager = sess({
      role: 'general_manager', staffRole: 'general_manager',
      permissions: {
        staff_create: true, inbox_view: true, inbox_view_all: true,
        inbox_reply: true, inbox_assign: true, inbox_delete: true,
      },
    })
    expect(isSuperAdmin(manager)).toBe(false)
    const superAdmin = sess({ role: 'super_admin', staffRole: 'super_admin', permissions: {} })
    expect(isSuperAdmin(superAdmin)).toBe(true)
  })

  it('conversation delete is permission-gated (super_admin passes via role check)', () => {
    const s = read('app/api/admin/conversations/[id]/route.ts')
    expect(s).toContain("checkInboxPermission(session, 'inbox_delete')")
    expect(s).not.toContain("session.staffRole !== 'super_admin'")
  })

  it('routing agent list and inbox mapping are permission-gated; mapping writes stay super-admin-only', () => {
    const routing = read('app/api/admin/routing/chatwoot-agents/route.ts')
    expect(routing).toContain("hasAnyInboxPermission(session, ['inbox_assign', 'settings_integrations'])")
    const mapping = read('app/api/admin/inbox-mapping/route.ts')
    // P1 hotfix (2026-09-19), Fix 2: tightened from 'inbox_view' (held by
    // nearly every role) to 'settings_integrations' — this route returns
    // the same email↔chatwootAgentId reconnaissance data the routing-agent
    // impersonation exploit needed.
    expect(mapping).toContain("checkInboxPermission(session, 'settings_integrations')")
    expect(mapping).toContain("session.role !== 'super_admin'")
  })
})

describe('behavior preservation (Jade / lifecycle untouched)', () => {
  it('resolve route still passes the status through to toggle_status unchanged', () => {
    const s = read('app/api/admin/conversations/[id]/resolve/route.ts')
    expect(s).toContain('/toggle_status')
    expect(s).toContain('JSON.stringify({ status })')
    // 0S.3 moved the legacy default (absent status → 'resolved') into
    // validateResolveStatus — same semantics, now allow-listed.
    expect(s).toContain('validateResolveStatus(body.status)')
  })

  it('assign route still posts to the assignments endpoint with the given assignee_id', () => {
    const s = read('app/api/admin/conversations/[id]/assign/route.ts')
    expect(s).toContain('/assignments')
    expect(s).toContain('JSON.stringify({ assignee_id })')
  })

  it('authz module fails closed on indeterminate state and resolves identity in the documented order', () => {
    const s = read('lib/inbox/authz.ts')
    expect(s).toContain('RoutingAgent')                         // 1. DB mapping
    expect(s).toContain('if (assigneeId === undefined) return DENY_CONVERSATION')
    expect(s).toContain('DENY_CONVERSATION')
  })

  // P1 security hotfix (2026-09-19): the hardcoded EMAIL_TO_AGENT fallback
  // tier was NOT actually removed in INBOX-0S.6 as the old comment here
  // claimed — it was still live, and a stale/reassigned numeric Chatwoot
  // id could resolve one staff member to a CURRENT STRANGER's identity.
  // It is now genuinely removed: resolution fails closed (id 0) instead.
  it('the EMAIL_TO_AGENT hardcoded fallback is gone from server-side identity resolution — fails closed instead', () => {
    const s = read('lib/inbox/authz.ts')
    // No import of the hardcoded map, and no executable reference to it —
    // the module doc comment is allowed to mention its NAME for historical/
    // security context (why it was removed), which is why this checks the
    // import and the executable usage, not a blanket "string never appears".
    expect(s).not.toContain("from '@/app/admin/inbox/types'")
    expect(s).not.toContain('EMAIL_TO_AGENT[')
    expect(s).not.toMatch(/id = EMAIL_TO_AGENT/)
    expect(s).toContain('let id = 0')
    // Only two resolution tiers remain, both documented as such.
    expect(s).toContain('1. RoutingAgent row (Supabase) by email')
    expect(s).toContain('2. Chatwoot agent list matched by email')
  })

  it('resolveChatwootAgentId returns 0 (fail closed) when the DB row and live Chatwoot lookup both fail to resolve', async () => {
    jest.resetModules()
    jest.doMock('@/lib/supabase', () => ({
      getSupabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null }) }),
            }),
          }),
        }),
      }),
    }))
    jest.doMock('@/lib/chatwoot/config', () => ({
      adminChatwootOrNull: () => null, // no Chatwoot config → tier 2 also can't resolve
    }))
    const { resolveChatwootAgentId, clearInboxAuthzCaches } = await import('@/lib/inbox/authz')
    clearInboxAuthzCaches()
    const id = await resolveChatwootAgentId('nobody-in-either-tier@walztravels.com')
    expect(id).toBe(0)
    jest.dontMock('@/lib/supabase')
    jest.dontMock('@/lib/chatwoot/config')
    jest.resetModules()
  })

  it('webhook and Jade surfaces gained no session/RBAC coupling', () => {
    for (const f of ['app/api/webhooks/chatwoot/route.ts', 'app/api/webhooks/meta/route.ts', 'app/api/jade/chatwoot/route.ts']) {
      expect(read(f)).not.toContain('inbox/authz')
    }
  })
})
