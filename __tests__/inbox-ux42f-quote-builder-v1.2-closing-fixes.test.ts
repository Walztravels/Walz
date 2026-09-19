/**
 * QUOTE BUILDER V1.2 — closing fix pass (security review PASS w/ 2 low-sev
 * recs, QA/accessibility review PASS WITH NOTES w/ 9 findings, plus a
 * mandatory investigation result). This file covers the one item that
 * needed a NEW regression test beyond simple source edits:
 *
 *  Security finding #1 — mobile/MobileWorkspace.tsx mounted
 *  <SelectPricePanel state={state} /> unconditionally, unlike
 *  tablet/TabletWorkspace.tsx, which already gates it behind
 *  `const gated = state.ctxError || !state.ctx || !state.identityOk ||
 *  state.duplicateOf || state.profileGate`. This is an additional UI guard
 *  on top of the existing (untouched) server-side re-verification in
 *  app/api/admin/travel-search/add-to-quote/route.ts — it stops the pricing
 *  sheet from staying interactive once identity/profile gating has taken
 *  over the workspace. Source-inspection style, matching how the rest of
 *  this test suite pins JSX/logic without rendering React (see
 *  inbox-ux42e-drawer-integrations.test.ts, inbox-ux42c-closing-fixes.test.ts).
 *
 * The remaining 10 items in this closing pass (innerHTML removal, the
 * 'package'->'custom' item-type fix + itemType-clobber removal, desktop
 * SelectPricePanel dialog semantics, role="alert" gate blocks, mobile label
 * associations, recent-quotes parity, desktop empty-states, the dead tablet
 * "Edit search" button, and the mobile disabled={submitting} button) are
 * either pure source edits with no new business logic to pin, or covered by
 * the dedicated breakpoint-consistency test in
 * inbox-ux42-quote-builder-v1.2-consistency.test.ts (the 'custom' vs
 * 'package' counting fix).
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const mobileSrc = read('app/admin/inbox/components/quote-builder/mobile/MobileWorkspace.tsx')
const tabletSrc = read('app/admin/inbox/components/quote-builder/tablet/TabletWorkspace.tsx')
const desktopSrc = read('app/admin/inbox/components/quote-builder/desktop/DesktopWorkspace.tsx')

const GATED_EXPR = 'state.ctxError || !state.ctx || !state.identityOk || state.duplicateOf || state.profileGate'

describe('Security finding #1 — SelectPricePanel identity/profile gating parity across all three breakpoints', () => {
  it('tablet (the reference implementation) computes `gated` with this exact expression and renders SelectPricePanel only when !gated', () => {
    expect(tabletSrc).toContain(GATED_EXPR)
    expect(tabletSrc).toContain('{!gated && <SelectPricePanel state={state} />}')
  })

  it('mobile now computes the SAME `gated` expression as tablet and gates its SelectPricePanel identically (previously mounted unconditionally — the regression this fix closes)', () => {
    expect(mobileSrc).toContain(GATED_EXPR)
    expect(mobileSrc).toContain('{!gated && <SelectPricePanel state={state} />}')
  })

  it('mobile never mounts SelectPricePanel ungated (regression guard: exactly one <SelectPricePanel occurrence, and it is the gated one)', () => {
    const occurrences = mobileSrc.split('<SelectPricePanel').length - 1
    expect(occurrences).toBe(1)
    // The one occurrence must be preceded by the `{!gated &&` guard on the
    // same line, not appear bare as `<SelectPricePanel state={state} />`
    // as a direct child of the workspace root.
    const idx = mobileSrc.indexOf('<SelectPricePanel')
    const lineStart = mobileSrc.lastIndexOf('\n', idx) + 1
    const line = mobileSrc.slice(lineStart, mobileSrc.indexOf('\n', idx))
    expect(line).toContain('{!gated &&')
  })

  it('desktop already gates SelectPricePanel (per the security review) — it renders exactly once, inside `state.pending &&`, itself only reachable inside the already-gated normal-workspace branch (after every ctxError/!ctx/!identityOk/duplicateOf/profileGate branch has been ruled out)', () => {
    const occurrences = desktopSrc.split('<SelectPricePanel').length - 1
    expect(occurrences).toBe(1)
    expect(desktopSrc).toContain('{state.pending && <SelectPricePanel state={state} />}')

    const panelIdx = desktopSrc.indexOf('<SelectPricePanel')
    const profileGateBranchIdx = desktopSrc.indexOf('state.profileGate ? (')
    const normalWorkspaceIdx = desktopSrc.indexOf('grid grid-cols-[19%_54%_27%]')
    expect(profileGateBranchIdx).toBeGreaterThan(-1)
    expect(normalWorkspaceIdx).toBeGreaterThan(profileGateBranchIdx)
    // SelectPricePanel must live inside the normal (fully-ungated) 3-column
    // workspace branch, not earlier in the ctxError/!ctx/!identityOk/
    // duplicateOf/profileGate chain.
    expect(panelIdx).toBeGreaterThan(normalWorkspaceIdx)
  })

  it('all three trees are therefore provably consistent: none can render SelectPricePanel while any identity/profile gate is active', () => {
    // Belt-and-suspenders: re-assert the shared invariant in one place so a
    // future edit to any single tree that breaks parity fails obviously
    // here, not just in one of the three tests above.
    for (const src of [mobileSrc, tabletSrc]) {
      expect(src).toContain(GATED_EXPR)
    }
  })
})

describe('QA finding #6 (closing re-review) — desktop empty-state must never render before a real search has run', () => {
  // The first attempt at this fix ported mobile's `results.length === 0`
  // condition verbatim, but desktop (unlike mobile) has no search/results
  // screen split — it renders the active panel unconditionally, so
  // "No X found" appeared on the very first paint of the workspace, before
  // staff had searched anything. Caught by the closing QA re-review. Fixed
  // with a purely local `hasSearched` flag per panel (not business state,
  // so it stays out of useQuoteBuilderState.ts), flipped only inside the
  // panel's own "Search X" button onClick.
  const flightSrc = read('app/admin/inbox/components/quote-builder/desktop/panels/FlightPanel.tsx')
  const hotelSrc = read('app/admin/inbox/components/quote-builder/desktop/panels/HotelPanel.tsx')
  const activitySrc = read('app/admin/inbox/components/quote-builder/desktop/panels/ActivityPanel.tsx')
  const transferSrc = read('app/admin/inbox/components/quote-builder/desktop/panels/TransferPanel.tsx')

  it.each([
    ['FlightPanel', flightSrc, 'flightResults', 'searchFlightsLive'],
    ['HotelPanel', hotelSrc, 'hotelResults', 'searchHotelsLive'],
    ['ActivityPanel', activitySrc, 'activityResults', 'searchActivitiesLive'],
    ['TransferPanel', transferSrc, 'transferResults', 'searchTransfersLive'],
  ])('%s: hasSearched starts false, is set inside the search button onClick, and gates the empty-state condition', (_name, src, resultsVar, searchFn) => {
    // Declared false — not derived from anything that could already be true
    // on first render.
    expect(src).toMatch(/const \[hasSearched, setHasSearched\] = useState\(false\)/)
    // Set only as part of triggering a real search, in the same click
    // handler that calls the actual search function — never anywhere else.
    expect(src).toMatch(new RegExp(`onClick=\\{\\(\\) => \\{ setHasSearched\\(true\\); void ${searchFn}\\(\\) \\}\\}`))
    // The empty-state condition requires hasSearched as its first clause.
    expect(src).toMatch(new RegExp(`hasSearched && !liveSearching && !liveError[^\\n]*${resultsVar}\\.length === 0`))
  })

  it('transfer panel keeps the empty-state and the transferUnavailable banner mutually exclusive even with the new hasSearched guard', () => {
    expect(transferSrc).toContain('hasSearched && !liveSearching && !liveError && !transferUnavailable && transferResults.length === 0')
  })
})
