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
    expect(block).toContain('fetchConvs()')
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
    const guard = s.indexOf("if (res.status === 401) { router.push('/admin/login'); return }")
    const failure = s.indexOf('if (!res.ok) {', guard)
    expect(guard).toBeGreaterThan(-1)
    expect(failure).toBeGreaterThan(guard)
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
