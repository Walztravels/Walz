/**
 * Phase 1 (Agent A — Inbox Performance):
 *  - the 5s conversation/message poll gained an in-flight overlap guard and
 *    a Page Visibility backoff (app/admin/inbox/page.tsx);
 *  - fetchMessages/refreshMessages gained a stale-response sequence guard,
 *    keyed by conversation id, extracted as a pure helper (createSeqGuard,
 *    lib/inbox/message-history.ts) so its actual behavior — not just its
 *    presence in source — is under test.
 */

import fs from 'fs'
import path from 'path'
import { createSeqGuard } from '@/lib/inbox/message-history'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const page = () => read('app/admin/inbox/page.tsx')

// ── createSeqGuard — real behavioral coverage ───────────────────────────────

describe('createSeqGuard — stale-response guard (behavioral)', () => {
  it('a single stream: each new request for the SAME id supersedes the previous one', () => {
    const g = createSeqGuard()
    const seq1 = g.next(7)
    const seq2 = g.next(7)   // e.g. refreshMessages fired again before fetchMessages(7) resolved
    expect(g.isCurrent(7, seq2)).toBe(true)
    expect(g.isCurrent(7, seq1)).toBe(false)   // seq1's response, if it arrives now, is stale
  })

  it('switching to a DIFFERENT id invalidates any in-flight request for the old one — the identity-confusion fix', () => {
    const g = createSeqGuard()
    const seqA = g.next(101)         // select conversation A
    const seqB = g.next(202)         // quickly select conversation B before A's fetch resolves
    // A's response arrives late:
    expect(g.isCurrent(101, seqA)).toBe(false)
    // B's response arrives (whenever) and is still current:
    expect(g.isCurrent(202, seqB)).toBe(true)
  })

  it('a response for an id that was never the most recent request is never current', () => {
    const g = createSeqGuard()
    g.next(1)
    expect(g.isCurrent(1, 999)).toBe(false)   // a seq that was never issued
    expect(g.isCurrent(2, 1)).toBe(false)     // a different, never-requested id
  })

  it('returning to a previously-superseded id treats it as current again, and the OLD generation as stale (no seq aliasing across a detour)', () => {
    const g = createSeqGuard()
    const seqA1 = g.next(5)
    g.next(6)                         // moved away from 5
    const seqA2 = g.next(5)           // back to 5 (e.g. re-selected)
    // Regression: a per-id counter would reissue the SAME seq number for
    // id 5 here (its own count reset while "away"), making the first,
    // genuinely stale request for id 5 indistinguishable from the second.
    expect(seqA2).not.toBe(seqA1)
    expect(g.isCurrent(5, seqA2)).toBe(true)
    expect(g.isCurrent(5, seqA1)).toBe(false)   // the pre-detour request for 5 is a stale generation
  })
})

// ── page.tsx wiring — source pins (this repo's established pattern for
// page.tsx, which has no jsdom-renderable test harness in the rest of the
// suite; the logic itself is covered above, real, not string-matched) ──────

describe('fetchMessages/refreshMessages use the shared seq guard', () => {
  it('both functions register a NEW request via msgSeqGuardRef.current.next(id) before awaiting fetchPage', () => {
    const s = page()
    const fm = s.slice(s.indexOf('const fetchMessages = useCallback'), s.indexOf('/** Poll refresh:'))
    const rm = s.slice(s.indexOf('const refreshMessages = useCallback'), s.indexOf('/** Load the previous page'))
    for (const fn of [fm, rm]) {
      expect(fn).toContain('msgSeqGuardRef.current.next(id)')
      expect(fn).toContain('msgSeqGuardRef.current.isCurrent(id, seq)')
      // the guard check happens AFTER the await, before any setState — a
      // stale response must never reach setMessages/setMsgLoadError.
      const awaitIdx  = fn.indexOf('await fetchPage(id)')
      const guardIdx  = fn.indexOf('isCurrent(id, seq)')
      const setMsgIdx = fn.indexOf('setMessages(')
      expect(awaitIdx).toBeGreaterThan(-1)
      expect(guardIdx).toBeGreaterThan(awaitIdx)
      expect(guardIdx).toBeLessThan(setMsgIdx)
    }
  })

  it('imports createSeqGuard from the shared pure helper module (not a bespoke inline ref)', () => {
    expect(page()).toContain("createSeqGuard } from '@/lib/inbox/message-history'")
    expect(page()).toContain('useRef(createSeqGuard())')
  })
})

// ── Incident fix (2026-09-21): fetchConvs itself was NEVER covered by a
// stale-response guard, unlike its sibling fetchMessages/refreshMessages
// above. fetchConvs is called from three uncoordinated sites (the poll
// effect's immediate call + its own 5s ticks, the tab-switch effect, and
// handleLoadMoreConvs) with only pollInFlightRef guarding the interval
// against itself — nothing stopped two of those calls from being in
// flight together. On a slow/variable mobile connection, an OLDER call
// can finish AFTER a newer one and do `prevConvIdsRef.current = newIds`
// with a stale (pre-arrival) snapshot, wholesale erasing the newer call's
// record that a conversation was already seen — so the very next poll
// tick detects that same conversation as "new" again and re-fires the
// "New message from X" toast a second time. Production evidence: Vercel
// runtime logs for /api/admin/conversations showed genuine duplicate
// near-simultaneous requests (same second) with no client-side
// coordination between them. ────────────────────────────────────────────

describe('fetchConvs uses a stale-response seq guard (prevConvIdsRef race fix)', () => {
  const fetchConvsBody = () => {
    const s = page()
    return s.slice(s.indexOf('const fetchConvs = useCallback'), s.indexOf('/** "Load more"'))
  }

  it('registers a new request via convsSeqGuardRef.current.next(0) BEFORE awaiting fetch', () => {
    const fn = fetchConvsBody()
    const nextIdx  = fn.indexOf('convsSeqGuardRef.current.next(0)')
    const fetchIdx = fn.indexOf('await fetch(url)')
    expect(nextIdx).toBeGreaterThan(-1)
    expect(fetchIdx).toBeGreaterThan(-1)
    expect(nextIdx).toBeLessThan(fetchIdx)
  })

  it('checks isCurrent(0, convsSeq) after awaiting the response, before touching prevConvIdsRef or any setState', () => {
    const fn = fetchConvsBody()
    // Finding 2 (2026-09-21) added the SAME guard string to the 401 and
    // !res.ok branches above this one (see the dedicated describe block
    // below) — anchor on the success path's own json parse (`const json =
    // await res.json()`) so this keeps testing the success-path guard
    // specifically, not whichever occurrence comes first in the source.
    const jsonIdx        = fn.indexOf('const json = await res.json()')
    const guardIdx       = fn.indexOf('convsSeqGuardRef.current.isCurrent(0, convsSeq)', jsonIdx)
    const setConvsErrIdx = fn.indexOf('setConvsError(null)')
    const setHasMoreIdx  = fn.indexOf('setHasMoreConvs(hasMore)')
    const prevIdsWriteIdx = fn.indexOf('prevConvIdsRef.current = newIds')
    expect(jsonIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(jsonIdx)
    // a stale response must be discarded before it clears an error, updates
    // hasMore, or overwrites prevConvIdsRef with an older snapshot
    expect(guardIdx).toBeLessThan(setConvsErrIdx)
    expect(guardIdx).toBeLessThan(setHasMoreIdx)
    expect(guardIdx).toBeLessThan(prevIdsWriteIdx)
  })

  it('bails out (return) rather than falling through when the response is stale', () => {
    const fn = fetchConvsBody()
    expect(fn).toContain('if (!convsSeqGuardRef.current.isCurrent(0, convsSeq)) return')
  })

  it('declares convsSeqGuardRef with the same shared createSeqGuard helper as msgSeqGuardRef', () => {
    const s = page()
    expect(s).toContain('const convsSeqGuardRef  = useRef(createSeqGuard())')
  })

  it('behaviorally: an older, slower call finishing after a newer one is recognized as stale', () => {
    // Same guard, same semantics as the createSeqGuard suite above — proves
    // the exact interleaving that caused the production bug is now caught.
    const g = createSeqGuard()
    const seqOld = g.next(0)   // e.g. a poll tick fires...
    const seqNew = g.next(0)   // ...then the tab-switch effect fires fetchConvs again before the tick's response lands
    // The NEWER call's response arrives first and wins:
    expect(g.isCurrent(0, seqNew)).toBe(true)
    // The OLDER call's response arrives late — must be recognized as stale,
    // so fetchConvs discards it instead of resetting prevConvIdsRef:
    expect(g.isCurrent(0, seqOld)).toBe(false)
  })
})

describe('poll overlap guard + visibility backoff', () => {
  const pollBlock = () => {
    const s = page()
    return s.slice(s.indexOf('const pollInFlightRef = useRef(false)'), s.indexOf('}, [profile, fetchConvs, refreshMessages])'))
  }

  it('a hidden tab skips the tick entirely (Page Visibility API)', () => {
    const block = pollBlock()
    const hiddenIdx = block.indexOf('document.hidden')
    const overlapIdx = block.indexOf('pollInFlightRef.current')
    expect(hiddenIdx).toBeGreaterThan(-1)
    // visibility is checked before the overlap flag is even consulted —
    // a hidden tab never touches pollInFlightRef at all.
    expect(hiddenIdx).toBeLessThan(overlapIdx)
  })

  it('a tick in flight is never overlapped by the next 5s tick', () => {
    const block = pollBlock()
    expect(block).toContain('if (pollInFlightRef.current) return')
    expect(block).toContain('pollInFlightRef.current = true')
    // the flag is cleared once BOTH fetchConvs and refreshMessages settle,
    // not fired-and-forgotten independently (which is what made overlap
    // possible before this fix).
    expect(block).toContain('Promise.allSettled([')
    expect(block).toContain('.finally(() => { pollInFlightRef.current = false })')
  })

  it('the poll still refreshes both the conversation list and the open conversation each tick', () => {
    const block = pollBlock()
    // P1.1 performance closing fix: a poll tick now explicitly marks
    // itself (isPoll: true) so fetchConvs can cap a "Load more"-expanded
    // want-count back down to the cheap default and merge instead of
    // replace — see DEFAULT_MINE_WANT / isCheapPoll in fetchConvs.
    expect(block).toContain('fetchConvs(false, { isPoll: true })')
    expect(block).toContain('refreshMessages(selectedRef.current.id)')
  })

  it('the interval itself is untouched (still 5000ms) — only what happens INSIDE a tick changed', () => {
    expect(page()).toContain('}, 5000)')
  })
})

describe('poll depth follows the currently-loaded window, not a fixed re-walk', () => {
  it('fetchConvs requests maxPages=<currently loaded depth>, not a hardcoded constant', () => {
    const s = page()
    expect(s).toContain('&maxPages=${loadedPagesRef.current}')
  })

  it('a tab switch resets the loaded depth to the fast default before refetching', () => {
    const s = page()
    const tabEffect = s.slice(s.indexOf('A tab switch is a genuinely different list'), s.indexOf('}, [tab])'))
    expect(tabEffect).toContain('loadedPagesRef.current = DEFAULT_LOADED_PAGES')
    expect(tabEffect).toContain('fetchConvs(true)')
  })

  it('"Load more" widens the depth BEFORE refetching, capped at the same hard ceiling the server enforces', () => {
    const s = page()
    const fn = s.slice(s.indexOf('const handleLoadMoreConvs'), s.indexOf('// ── Fetch messages'))
    expect(fn).toContain('loadedPagesRef.current = Math.min(loadedPagesRef.current + LOAD_MORE_STEP, MAX_LOADED_PAGES)')
    expect(s).toContain('const MAX_LOADED_PAGES = 8')
  })
})

// ── 401 replication — every NEW fetch path added by this release must
// replicate the exact redirect-to-login branch (incident 2026-09-18). ──────

describe('401 handling on every fetch path touched or added by this release', () => {
  it('fetchConvs (maxPages-aware now) still redirects on 401 before the failure-state branch', () => {
    const s = page()
    const guard = s.indexOf("if (res.status === 401) {")
    const failure = s.indexOf('if (!res.ok) {', guard)
    expect(guard).toBeGreaterThan(-1)
    expect(failure).toBeGreaterThan(guard)
    // Finding 2 (2026-09-21 incident): the redirect itself must still
    // happen — just now behind the staleness guard (see the describe block
    // below) rather than unconditionally.
    const branch = s.slice(guard, failure)
    expect(branch).toContain("router.push('/admin/login')")
  })

  it('the shared client-context hook (new fetch path) redirects on 401 before throwing', () => {
    const hook = read('lib/inbox/useClientContext.ts')
    expect(hook).toContain("if (res.status === 401) { router.push('/admin/login'); throw new Error('session expired') }")
  })

  it('handleLoadMoreConvs reuses fetchConvs (which already carries the 401 branch) instead of a parallel fetch call', () => {
    const s = page()
    const fn = s.slice(s.indexOf('const handleLoadMoreConvs'), s.indexOf('// ── Fetch messages'))
    expect(fn).not.toMatch(/fetch\(`\/api/)
    expect(fn).toContain('await fetchConvs()')
  })
})

// ── Finding 1 (2026-09-21 incident review) — "Load More" can be silently
// swallowed: handleLoadMoreConvs' fetch is heavier/slower than a routine
// poll tick, and had no coordination with pollInFlightRef (which only ever
// guarded the poll's OWN ticks against overlapping each other). A poll tick
// starting WHILE Load More is in flight finishes first, becomes "current"
// under convsSeqGuardRef, and Load More's own later-arriving response is
// discarded as stale — spinner stops, list doesn't change, no error. Fix:
// handleLoadMoreConvs now sets the SAME pollInFlightRef flag the poll
// effect already manages for itself, so the interval simply skips a tick
// while Load More is running instead of racing it. ──────────────────────────

describe('handleLoadMoreConvs coordinates with the poll overlap guard (Finding 1 fix)', () => {
  const loadMoreBody = () => {
    const s = page()
    return s.slice(s.indexOf('const handleLoadMoreConvs'), s.indexOf('// ── Fetch messages'))
  }

  it('sets pollInFlightRef.current = true before awaiting its own fetchConvs call', () => {
    const fn = loadMoreBody()
    const setTrueIdx = fn.indexOf('pollInFlightRef.current = true')
    const awaitIdx   = fn.indexOf('await fetchConvs()')
    expect(setTrueIdx).toBeGreaterThan(-1)
    expect(awaitIdx).toBeGreaterThan(-1)
    expect(setTrueIdx).toBeLessThan(awaitIdx)
  })

  it('resets pollInFlightRef.current = false in a finally block, so a thrown/rejected fetch can never leave polling permanently skipped', () => {
    const fn = loadMoreBody()
    const finallyIdx = fn.indexOf('} finally {')
    const resetIdx   = fn.indexOf('pollInFlightRef.current = false', finallyIdx)
    const setTrueIdx = fn.indexOf('pollInFlightRef.current = true')
    expect(finallyIdx).toBeGreaterThan(setTrueIdx)
    expect(resetIdx).toBeGreaterThan(finallyIdx)
    // mirrors the existing setLoadingMoreConvs(false) discipline in the
    // very same finally block
    expect(fn.slice(finallyIdx)).toContain('setLoadingMoreConvs(false)')
  })

  it('behaviorally: the poll interval callback already skips a tick outright whenever pollInFlightRef.current is true — the exact mechanism Load More now piggybacks on', () => {
    // Reproduces the poll effect's own tick-skip logic in isolation (see
    // "poll overlap guard + visibility backoff" above for the source pin
    // proving this is really what's in the interval callback) to prove the
    // flag alone is sufficient to defer a tick — no changes to the poll
    // effect itself were needed.
    const pollInFlightRef = { current: false }
    let tickRan = false
    const tick = () => {
      if (pollInFlightRef.current) return
      tickRan = true
    }
    // Load More starts — mirrors the fix's `pollInFlightRef.current = true`
    pollInFlightRef.current = true
    tick() // a 5s tick fires WHILE Load More is in flight
    expect(tickRan).toBe(false) // deferred, not raced
    // Load More finishes — mirrors the fix's `finally` reset
    pollInFlightRef.current = false
    tick() // the next tick is free to run
    expect(tickRan).toBe(true)
  })

  it('the flag is declared once and shared between the poll effect and handleLoadMoreConvs (not a separate, parallel ref)', () => {
    const s = page()
    expect((s.match(/const pollInFlightRef = useRef\(false\)/g) ?? []).length).toBe(1)
  })
})

// ── Finding 2 (2026-09-21 incident review) — fetchConvs' early-exit/error
// branches (401, !res.ok, catch) were NOT gated by convsSeqGuardRef, unlike
// the success path and unlike fetchMessages' own catch block. An older,
// slower call that fails AFTER a newer call already succeeded could stomp a
// freshly-loaded list with a bogus error, or force an unwanted redirect.
// Fix: all three branches now check isCurrent(0, convsSeq) before their
// respective router.push/setConvsError call, mirroring fetchMessages'
// catch block exactly. ───────────────────────────────────────────────────

describe('fetchConvs error/catch branches are guarded by the staleness check (Finding 2 fix)', () => {
  const fetchConvsBody = () => {
    const s = page()
    return s.slice(s.indexOf('const fetchConvs = useCallback'), s.indexOf('/** "Load more"'))
  }

  it('the 401 branch checks isCurrent BEFORE router.push, and still returns either way', () => {
    const fn = fetchConvsBody()
    const branchIdx = fn.indexOf('if (res.status === 401) {')
    const branchEnd = fn.indexOf('if (!res.ok) {', branchIdx)
    const branch = fn.slice(branchIdx, branchEnd)
    const guardIdx  = branch.indexOf('convsSeqGuardRef.current.isCurrent(0, convsSeq)')
    const pushIdx   = branch.indexOf("router.push('/admin/login')")
    expect(guardIdx).toBeGreaterThan(-1)
    expect(pushIdx).toBeGreaterThan(guardIdx)
    expect(branch).toContain('if (!convsSeqGuardRef.current.isCurrent(0, convsSeq)) return')
  })

  it('the !res.ok branch checks isCurrent BEFORE setConvsError', () => {
    const fn = fetchConvsBody()
    const branchIdx = fn.indexOf('if (!res.ok) {')
    const branchEnd = fn.indexOf("// API route unwraps Chatwoot envelope")
    const branch = fn.slice(branchIdx, branchEnd)
    const guardIdx = branch.indexOf('convsSeqGuardRef.current.isCurrent(0, convsSeq)')
    const setErrIdx = branch.indexOf('setConvsError(d.error')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(setErrIdx).toBeGreaterThan(guardIdx)
  })

  it('the catch block checks isCurrent BEFORE setConvsError, mirroring fetchMessages\' own catch block exactly', () => {
    const fn = fetchConvsBody()
    const catchIdx = fn.indexOf('} catch {')
    const finallyIdx = fn.indexOf('} finally {')
    const catchBlock = fn.slice(catchIdx, finallyIdx)
    const guardIdx = catchBlock.indexOf('convsSeqGuardRef.current.isCurrent(0, convsSeq)')
    const setErrIdx = catchBlock.indexOf("setConvsError('Could not load conversations. Please try again.')")
    expect(guardIdx).toBeGreaterThan(-1)
    expect(setErrIdx).toBeGreaterThan(guardIdx)
    expect(catchBlock).toContain('if (!convsSeqGuardRef.current.isCurrent(0, convsSeq)) return')
  })

  it('all three branches use the exact same guard expression as the success path, so isCurrent(0, convsSeq) appears at least 4 times total', () => {
    const fn = fetchConvsBody()
    const count = (fn.match(/convsSeqGuardRef\.current\.isCurrent\(0, convsSeq\)/g) ?? []).length
    // success path (1) + 401 (1) + !res.ok (1) + catch (1) = 4
    expect(count).toBe(4)
  })

  it('behaviorally: an older call that FAILS after a newer call already SUCCEEDED is recognized as stale (the exact race Finding 2 closes)', () => {
    const g = createSeqGuard()
    const seqOld = g.next(0)   // e.g. a slow poll tick fires, about to fail (401/network/!ok)...
    const seqNew = g.next(0)   // ...a newer call fires and succeeds first
    expect(g.isCurrent(0, seqNew)).toBe(true)
    // the older call's failure, arriving late, must be discarded — never
    // shown as a fresh error and never triggering a redirect
    expect(g.isCurrent(0, seqOld)).toBe(false)
  })
})
