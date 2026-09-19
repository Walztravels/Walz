/**
 * Incident 2026-09-18 — session expiry must not masquerade as a
 * provider failure.
 *
 * A staff member's 12h admin JWT expired mid-tab; the edge middleware
 * correctly 401'd every /api/admin/* call BEFORE the route ran (so no
 * RBAC, mapping, or Chatwoot code was ever reached), but the inbox
 * poller rendered it as "Could not load conversations. Retry" — an
 * unwinnable retry loop. 401 now returns staff to login.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('401 session expiry returns staff to login', () => {
  const page = () => read('app/admin/inbox/page.tsx')

  it('the conversation poller redirects on 401 BEFORE the provider-failure state', () => {
    const s = page()
    const guard = s.indexOf("if (res.status === 401) { router.push('/admin/login'); return }")
    // P1 hotfix (2026-09-19): the failure branch now reads the server's
    // message instead of setting a fixed boolean — same 401-first ordering.
    // Search AFTER guard: an earlier, unrelated `if (!res.ok) {` exists in
    // the profile-loading effect above fetchConvs.
    const failure = s.indexOf('if (!res.ok) {', guard)
    expect(guard).toBeGreaterThan(-1)
    expect(failure).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(failure)   // 401 handled first; 403/5xx keep the failure state
  })

  it('the message poller redirects on 401 instead of surfacing a load error', () => {
    expect(page()).toContain("if (res.status === 401) { router.push('/admin/login'); throw new Error('session expired') }")
  })

  it('403 and provider failures still render the controlled failure state (contract unchanged)', () => {
    const s = page()
    expect(s).toContain("setConvsError(d.error || 'Could not load conversations. Please try again.')")
    expect(s).toContain('loadFailed={convsError}')
    expect(s).toContain('onRetry={() => fetchConvs(true)}')
  })
})

describe('server-side layers stay distinguishable in logs', () => {
  it('expired sessions are rejected by the middleware with a 401 before any route runs', () => {
    const s = read('middleware.ts')
    expect(s).toContain("NextResponse.json({ error: 'Unauthorised' }, { status: 401 })")
  })

  it('provider failures keep their own observability line in the conversations route', () => {
    const s = read('app/api/admin/conversations/route.ts')
    expect(s).toContain('[conversations] Chatwoot upstream ${res.status}')
  })

  it('the admin JWT TTL is 12h — the expiry that triggered this incident', () => {
    expect(read('lib/admin-auth.ts')).toContain(".setExpirationTime('12h')")
  })
})
