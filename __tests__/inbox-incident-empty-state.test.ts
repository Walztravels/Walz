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

  it('a thrown fetch degrades to the same controlled null path as a non-2xx', () => {
    const s = route()
    expect(s).toContain('if (!res) return null')
    // page-1 null still surfaces the controlled 502 (0S.3 contract untouched)
    expect(s).toContain("{ error: 'Could not load conversations. Please try again.' }")
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

  it('the plain "No conversations" state still exists for a genuinely empty inbox', () => {
    expect(read('app/admin/inbox/components/ConversationList.tsx')).toContain('No conversations')
  })
})
