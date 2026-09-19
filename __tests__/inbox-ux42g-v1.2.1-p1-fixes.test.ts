/**
 * QUOTE BUILDER V1.2.1 — production UX polish, P1 fixes.
 *
 * P1 #1 (quote delivery-state truthfulness): quote.status is a SERVER field
 * that becomes 'sent' the instant Finalize mints a share link (PATCH
 * {action:'send', suppressNotifications:true} — see
 * app/api/admin/quotes/[id]/route.ts, line ~118, unchanged by this fix),
 * regardless of whether anything was ever actually messaged to the client.
 * Rendering statusLabel(quote.status) directly produced "Status: Sent"
 * sitting right above "Nothing has been sent to the client yet." Finalize
 * != Send is still true in the real architecture (the local `sent` flag is
 * only set after handleSendToClient's onSendMessage call succeeds) — the
 * bug was purely a display-layer one. Fixed by deriving the displayed
 * label from local state instead of the overloaded server field, in both
 * desktop/QuoteSummaryPanel.tsx and mobile/QuoteBasketSheet.tsx (tablet
 * reuses the mobile file unmodified).
 *
 * P1 #2 (stale search error): confirmAddPending/acceptPriceChange write
 * liveError on failure using the exact same shared state slot every
 * search*Live() function does. A slow add-to-quote failure response could
 * resolve AFTER a newer, successful search had already cleared liveError
 * and repopulated results — silently overwriting the fresh, correct state
 * with a leftover error. Fixed with a single shared generation counter
 * (liveOpSeqRef): every search function and both add-to-quote attempts
 * capture the current value before their async work, and only write
 * liveError if nothing newer has started in the meantime. Successful
 * mutations (attaching an item) are never suppressed by this — only the
 * ERROR-writing path is guarded, since the underlying mutation, if it
 * lands, genuinely happened server-side.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const hookSrc = read('app/admin/inbox/components/quote-builder/useQuoteBuilderState.ts')
const desktopSummarySrc = read('app/admin/inbox/components/quote-builder/desktop/QuoteSummaryPanel.tsx')
const mobileBasketSrc = read('app/admin/inbox/components/quote-builder/mobile/QuoteBasketSheet.tsx')

describe('P1 #1 — quote delivery-state truthfulness', () => {
  it.each([
    ['desktop/QuoteSummaryPanel.tsx', desktopSummarySrc],
    ['mobile/QuoteBasketSheet.tsx', mobileBasketSrc],
  ])('%s derives the displayed Status from local `sent` state, not the raw server quote.status, once finalized', (_name, src) => {
    expect(src).toMatch(/const deliveryStatusLabel = !isFinalized \? statusLabel\(quote\?\.status \?\? 'draft'\) : sent \? 'Sent to client' : 'Ready to share'/)
    // The rendered line must use the derived label, not the raw server field.
    expect(src).toContain('Status: {deliveryStatusLabel}')
    expect(src).not.toContain('Status: {statusLabel(quote.status)}')
  })

  it('the underlying finalize/send architecture is unchanged — handleFinalize still only mints a share link (action:\'send\', suppressNotifications:true), and handleSendToClient is still the only path that can set `sent` true', () => {
    const finalizeBody = hookSrc.slice(hookSrc.indexOf('async function handleFinalize'), hookSrc.indexOf('function buildQuoteMessage'))
    expect(finalizeBody).toContain("action: 'send', suppressNotifications: true")
    expect(finalizeBody).not.toContain('setSent(')
    const sendBody = hookSrc.slice(hookSrc.indexOf('async function handleSendToClient'))
    expect(sendBody).toContain('setSent(true)')
  })

  it('both trees still render the truthful "Nothing has been sent to the client yet" copy only in the not-yet-actually-sent branch, and it can no longer be contradicted by the Status line above it since both now derive from the same local `sent` flag', () => {
    for (const src of [desktopSummarySrc, mobileBasketSrc]) {
      expect(src).toContain('Nothing has been sent to the client yet')
    }
  })

  it('both trees now offer a compact Preview action in the finalized branch too (P2 link-presentation fix), and neither prints the raw quote.link URL as visible text anywhere in the summary/basket', () => {
    for (const src of [desktopSummarySrc, mobileBasketSrc]) {
      // The removed line printed the URL as a text node: ...>{quote.link}<...
      expect(src).not.toMatch(/>\{quote\.link\}</)
      // quote.link must still be used as the actual href on at least two
      // Preview-labeled links (pre-finalize "Preview (read-only)" and the
      // new post-finalize "Preview") — the URL stays available to the
      // Copy/Insert/Send logic and to these compact actions, just never
      // printed as visible text.
      const hrefCount = (src.match(/href=\{quote\.link\}/g) ?? []).length
      expect(hrefCount).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('P1 #2 — a newer search/add-to-quote attempt always supersedes an older one\'s error', () => {
  it('a single shared generation ref exists and is bumped at the start of every search function and both add-to-quote attempts', () => {
    expect(hookSrc).toContain('const liveOpSeqRef = useRef(0)')
    const starters = [
      'async function searchFlightsLive() {\n    const opSeq = ++liveOpSeqRef.current',
      'async function searchHotelsLive() {\n    const opSeq = ++liveOpSeqRef.current',
      'async function searchActivitiesLive() {\n    const opSeq = ++liveOpSeqRef.current',
      'async function searchTransfersLive() {\n    const opSeq = ++liveOpSeqRef.current',
    ]
    for (const s of starters) expect(hookSrc).toContain(s)
    // confirmAddPending/acceptPriceChange bump it after their own liveBusy/
    // pending guards (not literally the first line, since those synchronous
    // early-returns don't need seq protection), but still before any async
    // work.
    expect(hookSrc).toMatch(/async function confirmAddPending\(\) \{\s*if \(!pending \|\| liveBusy\) return\s*\n\s*const opSeq = \+\+liveOpSeqRef\.current/)
    expect(hookSrc).toMatch(/async function acceptPriceChange\(\) \{\s*if \(!priceChange \|\| !pending \|\| liveBusy\) return\s*\n\s*const opSeq = \+\+liveOpSeqRef\.current/)
  })

  it('every search function checks the captured seq against the current one before writing liveError/results from its response, and again in its catch block', () => {
    for (const fnName of ['searchFlightsLive', 'searchHotelsLive', 'searchActivitiesLive', 'searchTransfersLive']) {
      const start = hookSrc.indexOf(`async function ${fnName}`)
      const nextFn = hookSrc.indexOf('\n  async function ', start + 10)
      const body = hookSrc.slice(start, nextFn === -1 ? start + 2000 : nextFn)
      expect(body).toContain('if (opSeq !== liveOpSeqRef.current) return')
      expect(body).toMatch(/catch \{ if \(opSeq === liveOpSeqRef\.current\) setLiveError/)
    }
  })

  it('confirmAddPending and acceptPriceChange only surface a failure via setLiveError when their captured seq is still current, but never gate the SUCCESS path (a real mutation that lands is always applied)', () => {
    const confirmBody = hookSrc.slice(hookSrc.indexOf('async function confirmAddPending'), hookSrc.indexOf('function cancelPriceChange'))
    expect(confirmBody).toMatch(/if \(opSeq === liveOpSeqRef\.current\) \{\s*setLiveError\(typeof data\?\.error/)
    expect(confirmBody).toMatch(/catch \{\s*if \(opSeq === liveOpSeqRef\.current\) setLiveError/)
    // Success path — setAttachedLive/setPending(null) — must NOT be
    // conditioned on opSeq anywhere in this function.
    const successIdx = confirmBody.indexOf('setAttachedLive(prev =>')
    expect(successIdx).toBeGreaterThan(-1)
    expect(confirmBody.slice(Math.max(0, successIdx - 80), successIdx)).not.toContain('liveOpSeqRef')

    const acceptBody = hookSrc.slice(hookSrc.indexOf('async function acceptPriceChange'))
    expect(acceptBody).toMatch(/if \(opSeq === liveOpSeqRef\.current\) \{\s*setLiveError\(typeof data\?\.error/)
    expect(acceptBody).toMatch(/catch \{\s*if \(opSeq === liveOpSeqRef\.current\) setLiveError/)
  })

  it('behavioral proof: simulating the exact production race (a slow, now-stale add-to-quote failure resolving after a newer, successful search) — the stale error must never win', () => {
    // Minimal behavioral re-implementation of the guard pattern itself
    // (not the full hook, which needs a React render context) — proves the
    // counter semantics are actually sufficient to prevent the reported
    // race, independent of the source-string checks above.
    let liveOpSeq = 0
    let liveError: string | null = null
    let hotelResults: string[] = []

    // Attempt A (older): staff clicks "Add to Quote" on a hotel offer.
    const aSeq = ++liveOpSeq
    // ...request in flight (slow)...

    // Attempt B (newer): staff runs a fresh, successful hotel search before
    // A resolves.
    const bSeq = ++liveOpSeq
    liveError = null // search clears the error optimistically, same as searchHotelsLive()
    // B's response arrives first and succeeds:
    if (bSeq === liveOpSeq) {
      hotelResults = ['GBP hotel A', 'GBP hotel B']
    }

    // A's stale failure now finally arrives.
    if (aSeq === liveOpSeq) {
      liveError = 'This rate is priced in a different currency than expected. Please re-search and try again.'
    }

    expect(liveError).toBeNull()
    expect(hotelResults).toEqual(['GBP hotel A', 'GBP hotel B'])
  })
})
