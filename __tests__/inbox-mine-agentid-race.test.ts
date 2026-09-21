/**
 * P1 production incident (2026-09-21) — Mine/Resolved stuck forever on
 * "Still checking your older conversations…" for ordinary staff.
 *
 * Root cause: app/admin/inbox/page.tsx resolves the logged-in staff
 * member's OWN Chatwoot agent id client-side via a two-tier lookup
 * (GET /api/admin/inbox-mapping, then GET /api/admin/agents) and uses that
 * value to re-filter a Mine/Resolved list the server had ALREADY scoped to
 * "mine" server-side. The 2026-09-19 security hotfix (see
 * app/api/admin/inbox-mapping/route.ts) gated inbox-mapping behind
 * 'settings_integrations' — a permission ordinary staff never hold — so
 * tier 1 always 403s for them now. Tier 2 (matching the staff member's
 * admin-login email against the live Chatwoot agent list) has no further
 * fallback, so a staff member whose Chatwoot agent email differs from
 * their admin login email — precisely the case the RoutingAgent DB mapping
 * (tier 1) exists to cover — can never resolve past 0 on the client. That
 * stuck-at-0 id fed the client's own redundant re-filter of an
 * already-scoped list, permanently zeroing `displayed` while `hasMore`
 * stayed true (ConversationList.tsx's defensive "Still checking your
 * older conversations…" branch, which by design never yields to the
 * definitive empty state while hasMore is true — so the loading message
 * simply never clears).
 *
 * Confirmed in production Vercel logs: visa@walztravels.com hit
 * `[inbox-mapping] permission denied for visa@walztravels.com`
 * continuously across 2026-09-19 through 2026-09-21 (40 occurrences).
 *
 * Fix: GET /api/admin/conversations already computes the caller's real
 * agent id server-side (resolveChatwootAgentId, no permission gate — a
 * direct Supabase lookup) to build the "mine" list in the first place —
 * this now returns that value as `myAgentId` at zero extra cost, and the
 * client prefers it over its own racy/gate-able resolution for this
 * fetch's filtering, syncing it into `profile` for every subsequent call
 * too. The server-execution half of this fix (myAgentId present in the
 * route's JSON response) is covered in
 * __tests__/inbox-conversations-pagination.test.ts; this file covers the
 * CLIENT half.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const page = () => read('app/admin/inbox/page.tsx')

function fetchConvsSlice(src: string): string {
  const start = src.indexOf('const fetchConvs = useCallback')
  const end = src.indexOf('/** "Load more"', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('page.tsx fetchConvs — prefers the server-resolved myAgentId over the client\'s own racy resolution', () => {
  it('reads myAgentId off the JSON response (both envelope shapes)', () => {
    const fn = fetchConvsSlice(page())
    expect(fn).toMatch(/json\?\.myAgentId/)
    expect(fn).toMatch(/json\?\.data\?\.myAgentId/)
  })

  it('syncs a resolved myAgentId into profile state so every consumer (and the next call) sees the correct id', () => {
    const fn = fetchConvsSlice(page())
    const idx = fn.indexOf('serverAgentId')
    expect(idx).toBeGreaterThan(-1)
    const nearby = fn.slice(idx, idx + 400)
    expect(nearby).toMatch(/setProfile\(prev\s*=>\s*\(prev\s*\?\s*\{\s*\.\.\.prev,\s*chatwootAgentId:\s*serverAgentId\s*\}/)
  })

  it('the Mine-tab filter, the RBAC defence-in-depth filter, and the mine count all key off the same resolved myId — not profile.chatwootAgentId directly, which is exactly the value that can get stuck at 0', () => {
    const fn = fetchConvsSlice(page())
    const myIdDecl = fn.indexOf('const myId = serverAgentId')
    expect(myIdDecl).toBeGreaterThan(-1)

    // Everything using the resolved agent id for filtering must come AFTER
    // the myId declaration and reference myId, not profile?.chatwootAgentId
    // (a regression could silently reintroduce the stale/racy read).
    const afterDecl = fn.slice(myIdDecl)
    expect(afterDecl).toMatch(/assignee\)\?\.id === myId/)          // Mine-tab filter
    expect(afterDecl).toMatch(/myId > 0 && assignee\.id === myId/)  // RBAC pass
    expect(afterDecl).not.toMatch(/=== profile\?\.chatwootAgentId/)
    expect(afterDecl).not.toMatch(/profile\.chatwootAgentId > 0/)
  })

  it('falls back to profile.chatwootAgentId only when the server did not supply myAgentId (e.g. a viewAll session, where the route never computes it)', () => {
    const fn = fetchConvsSlice(page())
    expect(fn).toContain('const myId = serverAgentId ?? profile?.chatwootAgentId ?? 0')
  })
})
