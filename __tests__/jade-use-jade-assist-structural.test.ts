/**
 * V1.4 — app/admin/inbox/useJadeAssist.ts. This repo's Jest suite runs
 * under the 'node' test environment (no jsdom/RTL — confirmed by every
 * other React hook in the Inbox, e.g. useQuoteBuilderState.ts and
 * ComposerDraftContext.tsx, having no direct runtime unit test; only the
 * routes they call are unit tested). This is a structural/source-based
 * check of the release-blocking safety properties (owner decision 12 —
 * race/stale-response protection — and the 401 session-expiry convention),
 * mirroring the structural-guarantee pattern already used elsewhere this
 * session (e.g. the no-auto-send checks on the jade-assist/jade-suggest-
 * actions route files).
 */
import fs from 'fs'

const src = fs.readFileSync(require.resolve('@/app/admin/inbox/useJadeAssist'), 'utf8')

describe('useJadeAssist — structural safety guarantees', () => {
  it('captures the epoch BEFORE the fetch and re-checks it after the fetch resolves', () => {
    expect(src).toMatch(/const epoch = epochRef\.current/)
    expect(src).toMatch(/if \(epochRef\.current !== epoch\) return null/)
  })

  it('re-checks the epoch a SECOND time after parsing the JSON body — either await can cross a conversation switch', () => {
    const checks = src.match(/if \(epochRef\.current !== epoch\) return null/g) ?? []
    expect(checks.length).toBeGreaterThanOrEqual(2)
  })

  it('bumps the epoch whenever conversationId changes, invalidating any in-flight request for the old conversation', () => {
    expect(src).toMatch(/epochRef\.current \+= 1/)
    expect(src).toMatch(/prevConversationIdRef\.current !== conversationId/)
  })

  it('only clears the busy flag when the epoch still matches — a stale request never clobbers a newer one\'s loading state', () => {
    expect(src).toMatch(/finally \{\s*if \(epochRef\.current === epoch\) setBusy\(false\)/)
  })

  it('ALSO resets busy on the conversation-change effect itself — otherwise switching mid-request leaves busy stuck true forever, since the stale request\'s own finally block deliberately skips clearing it (regression: independent security/QA review found the panel permanently disabled after a conversation switch mid-flight)', () => {
    const changeEffect = src.slice(src.indexOf('useEffect(() => {\n    if (prevConversationIdRef'), src.indexOf('}, [conversationId])') + 20)
    expect(changeEffect).toMatch(/setBusy\(false\)/)
  })

  it('follows the existing Inbox session-expiry convention: redirect to /admin/login on 401, never a generic "unavailable" error', () => {
    expect(src).toMatch(/res\.status === 401/)
    expect(src).toMatch(/router\.push\('\/admin\/login'\)/)
  })

  it('never leaves the original message text referenced as mutated on failure — error copy says so explicitly', () => {
    expect(src).toMatch(/original message has not been changed/)
  })
})
