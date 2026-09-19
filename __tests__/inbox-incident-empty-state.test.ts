/**
 * Incident 2026-09-17 — regression pins.
 *
 * Chatwoot's Railway container degraded (cold/starved) and the
 * conversations proxy returned 502s across four deployments. Two gaps
 * made the incident worse than it needed to be:
 *   1. The route logged NOTHING on upstream failure — zero server-side
 *      evidence of the upstream status existed.
 *   2. With the list request failing, the UI's list body still read
 *      "No conversations" — a failure masquerading as an empty inbox.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('conversations route upstream observability', () => {
  const route = () => read('app/api/admin/conversations/route.ts')

  it('logs the upstream status when Chatwoot fails (never silent again)', () => {
    expect(route()).toContain('[conversations] Chatwoot upstream ${res.status}')
    expect(route()).toContain('[conversations] Chatwoot unreachable:')
    expect(route()).toContain('[conversations] Chatwoot non-JSON response')
  })

  it('a thrown fetch degrades to a distinct network-failure result, still surfaced as a controlled error', () => {
    const s = route()
    // P1 hotfix (2026-09-19): a thrown/timed-out fetch is now distinguished
    // from a non-2xx upstream status (both still fail the request, page 1
    // still surfaces a controlled error — but the message differs).
    expect(s).toContain("if (!res) return { ok: false, status: 'network' }")
    expect(s).toContain('mapChatwootFailure')
    expect(s).toContain('messaging service unreachable')
  })
})

describe('errored list never masquerades as an empty inbox', () => {
  it('ConversationList renders the failure state when the request failed and the list is empty', () => {
    const s = read('app/admin/inbox/components/ConversationList.tsx')
    expect(s).toContain('loadFailed')
    const failFirst = s.indexOf('Could not load conversations.')
    const emptyState = s.indexOf('No conversations')
    expect(failFirst).toBeGreaterThan(-1)
    // the failure branch is evaluated BEFORE the plain empty state
    expect(failFirst).toBeLessThan(emptyState)
    expect(s).toContain('onRetry')
  })

  it('the page wires convsError into the list (banner and list body agree)', () => {
    const s = read('app/admin/inbox/page.tsx')
    expect(s).toContain('loadFailed={convsError}')
    expect(s).toContain('onRetry={() => fetchConvs(true)}')
  })

  // P1 hotfix (2026-09-19): convsError now carries the server's actual error
  // message (permission-denial vs provider-outage read differently) instead
  // of a fixed boolean that always rendered the same generic string.
  it('convsError carries the distinguishing message, not just a boolean flag', () => {
    const s = read('app/admin/inbox/page.tsx')
    expect(s).toContain('useState<string | null>(null)')
    expect(s).toContain("setConvsError(d.error || 'Could not load conversations. Please try again.')")
  })

  it('the plain "No conversations" state still exists for a genuinely empty inbox', () => {
    expect(read('app/admin/inbox/components/ConversationList.tsx')).toContain('No conversations')
  })
})
