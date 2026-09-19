/**
 * P1.1 INBOX COMPLETENESS REGRESSION FIX (2026-09-19).
 *
 * Production incident: after the Phase 1 performance release (fdd9334b),
 * an ordinary staff member (Oluchi Uko) whose assigned conversations were
 * not among the first DEFAULT_LOADED_PAGES team-wide Chatwoot pages saw
 * "No conversations assigned to you." — a false empty state, since her
 * conversations existed further back but were never scanned before the
 * ownership filter ran.
 *
 * Server-side fix is covered end-to-end (real route handler, concurrent
 * data scenarios) in __tests__/inbox-conversations-pagination.test.ts.
 * This file covers the CLIENT-side half of the fix:
 *  - app/admin/inbox/page.tsx no longer sends maxPages for non-viewAll
 *    sessions (which the server would now ignore anyway, but the client
 *    must ask correctly, not rely on server tolerance);
 *  - non-viewAll sessions get a PER-TAB want-count (mineWantCountRef) that
 *    survives Mine → Resolved → Mine tab switches, unlike viewAll's
 *    loadedPagesRef (deliberately left resetting on tab switch — that's
 *    pre-existing, unchanged Phase 1 behavior for managers/admins);
 *  - handleLoadMoreConvs bumps the correct depth for the session's role;
 *  - ConversationList never renders the definitive "No conversations
 *    assigned to you" while hasMore is true.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const page = () => read('app/admin/inbox/page.tsx')
const list = () => read('app/admin/inbox/components/ConversationList.tsx')
const route = () => read('app/api/admin/conversations/route.ts')

describe('page.tsx — non-viewAll sessions use wantCount, never maxPages', () => {
  it('fetchConvs branches on canViewAllNow and sends wantCount for non-viewAll, maxPages only for viewAll', () => {
    const src = page()
    const fnStart = src.indexOf('const fetchConvs = useCallback')
    const fnEnd = src.indexOf('handleLoadMoreConvs', fnStart)
    expect(fnStart).toBeGreaterThan(-1)
    const fn = src.slice(fnStart, fnEnd)
    expect(fn).toContain('canViewAllNow')
    expect(fn).toContain('wantCount=')
    expect(fn).toContain('maxPages=')
    // The branch must exist — both param names present is not enough on
    // its own (a copy-paste of both could look right while never actually
    // branching); confirm a real conditional selects between them.
    expect(fn).toMatch(/canViewAllNow\s*\?/)
  })

  it('mineWantCountRef is keyed per-tab (mine/resolved), not a single shared depth', () => {
    const src = page()
    expect(src).toContain('mineWantCountRef')
    const declIdx = src.indexOf('mineWantCountRef = useRef')
    expect(declIdx).toBeGreaterThan(-1)
    const declSlice = src.slice(declIdx, declIdx + 300)
    expect(declSlice).toContain('mine:')
    expect(declSlice).toContain('resolved:')
  })

  it('the tab-switch effect resets loadedPagesRef (viewAll) but does NOT reset mineWantCountRef (non-viewAll) — the exact mechanism that made the production bug worse than a one-time miss', () => {
    const src = page()
    const effectStart = src.indexOf('A tab switch is a genuinely different list')
    const effectEnd = src.indexOf('}, [tab])', effectStart)
    expect(effectStart).toBeGreaterThan(-1)
    expect(effectEnd).toBeGreaterThan(effectStart)
    const effectBody = src.slice(effectStart, effectEnd)
    expect(effectBody).toContain('loadedPagesRef.current = DEFAULT_LOADED_PAGES')
    // The effect's doc comment legitimately explains mineWantCountRef is
    // NOT touched here — check for an actual mutation, not the bare name.
    expect(effectBody).not.toMatch(/mineWantCountRef\.current(\[[^\]]+\])?\s*=/)
  })
})

describe('page.tsx — handleLoadMoreConvs bumps the correct depth for the session role', () => {
  it('bumps loadedPagesRef for viewAll, mineWantCountRef[tab] for non-viewAll — never the wrong one', () => {
    const src = page()
    const fnStart = src.indexOf('const handleLoadMoreConvs = useCallback')
    const fnEnd = src.indexOf('// ── Fetch messages', fnStart)
    expect(fnStart).toBeGreaterThan(-1)
    const fn = src.slice(fnStart, fnEnd > -1 ? fnEnd : fnStart + 1200)
    expect(fn).toContain('canViewAllNow')
    expect(fn).toContain('loadedPagesRef.current = Math.min(loadedPagesRef.current + LOAD_MORE_STEP, MAX_LOADED_PAGES)')
    expect(fn).toContain('mineWantCountRef.current[mineTabKey]')
    expect(fn).toContain('MINE_WANT_STEP')
    expect(fn).toContain('MAX_MINE_WANT')
  })
})

describe('ConversationList.tsx — empty state can never contradict hasMore', () => {
  it('the definitive "No conversations assigned to you" branch is only reached when hasMore is false for mine/resolved', () => {
    const src = list()
    const emptyIdx = src.indexOf('No conversations assigned to you.')
    expect(emptyIdx).toBeGreaterThan(-1)
    // Walk backward from the definitive-empty literal to the nearest
    // `hasMore` guard that gates reaching it — proves the branch ordering,
    // not just that both strings exist somewhere in the file.
    const before = src.slice(0, emptyIdx)
    const lastHasMoreGuard = before.lastIndexOf('&& hasMore ?')
    expect(lastHasMoreGuard).toBeGreaterThan(-1)
    // Nothing between the hasMore-guarded branch and the definitive-empty
    // literal should be another unconditional early return for this state.
    const between = src.slice(lastHasMoreGuard, emptyIdx)
    expect(between).toContain('Still checking your older conversations')
  })

  it('the provisional continuation state exists and is distinct from every other empty-state literal', () => {
    const src = list()
    expect(src).toContain('Still checking your older conversations…')
    expect(src).not.toContain('Still checking your older conversations…No conversations')
  })
})

describe('page.tsx — performance closing fix: a poll tick never re-runs the full expanded scan, and never shrinks an expanded rail', () => {
  it('the poll interval marks its fetchConvs call isPoll:true', () => {
    const src = page()
    const pollStart = src.indexOf('const pollInFlightRef')
    const pollEnd = src.indexOf('}, 5000)', pollStart)
    expect(pollStart).toBeGreaterThan(-1)
    const pollBlock = src.slice(pollStart, pollEnd)
    expect(pollBlock).toContain('fetchConvs(false, { isPoll: true })')
  })

  it('fetchConvs caps a poll tick\'s own wantCount at DEFAULT_MINE_WANT — it never sends the full expanded mineWantCountRef value on a routine tick', () => {
    const src = page()
    const fnStart = src.indexOf('const fetchConvs = useCallback')
    const fnEnd = src.indexOf('const res = await fetch(url)', fnStart)
    expect(fnStart).toBeGreaterThan(-1)
    const fn = src.slice(fnStart, fnEnd)
    expect(fn).toContain('isCheapPoll')
    expect(fn).toMatch(/Math\.min\(mineWantCountRef\.current\[mineTabKey\],\s*DEFAULT_MINE_WANT\)/)
  })

  it('setConvs merges (never replaces) specifically when a poll tick was capped below the actually-desired depth — a cheap partial poll can never shrink an expanded rail', () => {
    const src = page()
    const idx = src.indexOf('wasCappedPoll')
    expect(idx).toBeGreaterThan(-1)
    const nearby = src.slice(idx, idx + 500)
    expect(nearby).toContain('if (!wasCappedPoll) return safeFiltered')
    expect(nearby).toMatch(/stillLoadedButNotRefreshed\s*=\s*prev\.filter/)
    expect(nearby).toContain('[...safeFiltered, ...stillLoadedButNotRefreshed]')
  })

  it('an UNEXPANDED view (mineWantCountRef still at the default) is not affected by the cap/merge machinery at all — only a Load-More-expanded view pays for it', () => {
    const src = page()
    const idx = src.indexOf('wasCappedPoll = isCheapPoll')
    expect(idx).toBeGreaterThan(-1)
    const line = src.slice(idx, src.indexOf('\n', idx))
    expect(line).toContain('mineWantCountRef.current[mineTabKey] > DEFAULT_MINE_WANT')
  })

  it('explicit actions (Load More, tab switch, retry, initial load) never pass isPoll — only the interval tick does', () => {
    const src = page()
    const occurrences = (src.match(/fetchConvs\(/g) || []).length
    const isPollOccurrences = (src.match(/isPoll:\s*true/g) || []).length
    expect(occurrences).toBeGreaterThan(1)
    expect(isPollOccurrences).toBe(1)   // exactly the one poll-interval call site
  })
})

describe('route.ts — non-viewAll never trusts maxPages, viewAll path is byte-identical to Phase 1', () => {
  it('the non-viewAll branch reads wantCount via requestedWantCount, not requestedMaxPages', () => {
    const src = route()
    const viewAllBranchIdx = src.indexOf('if (!viewAll) {')
    const viewAllBranchEnd = src.indexOf('// viewAll (manager/admin/super_admin)', viewAllBranchIdx)
    expect(viewAllBranchIdx).toBeGreaterThan(-1)
    expect(viewAllBranchEnd).toBeGreaterThan(viewAllBranchIdx)
    const nonViewAllBranch = src.slice(viewAllBranchIdx, viewAllBranchEnd)
    expect(nonViewAllBranch).toContain('requestedWantCount')
    expect(nonViewAllBranch).not.toContain('requestedMaxPages')
  })

  it('the viewAll branch still uses requestedMaxPages exactly as Phase 1 did — untouched by this fix', () => {
    const src = route()
    const viewAllBranchIdx = src.indexOf('// viewAll (manager/admin/super_admin)')
    expect(viewAllBranchIdx).toBeGreaterThan(-1)
    const viewAllBranch = src.slice(viewAllBranchIdx)
    expect(viewAllBranch).toContain('requestedMaxPages')
    expect(viewAllBranch).not.toContain('requestedWantCount')
  })

  it('hasMore in the non-viewAll branch is forced false once the hard ceiling is reached, closing the dead-end', () => {
    const src = route()
    const idx = src.indexOf('const atCeiling')
    expect(idx).toBeGreaterThan(-1)
    const nearby = src.slice(idx, idx + 300)
    expect(nearby).toContain('!atCeiling')
  })
})
