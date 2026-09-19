/**
 * @jest-environment jsdom
 */

// INBOX Phase 1 (Agent A — Inbox Performance) — shared client-context cache.
//
// Every sibling inbox-*.test.ts file source-pins page/component code
// instead of rendering React, because the suite's default testEnvironment
// is 'node' (no DOM). The dedup/TTL/invalidation logic added here
// (lib/inbox/useClientContext.ts) is genuinely new and load-bearing for 6
// call sites at once — a source pin cannot prove two siblings mounted at
// the same tick actually share ONE fetch, so this file overrides to jsdom
// and renders the hook for real via react-dom/client + act (no new test
// library added; react-dom already ships both).
//
// Fixes verified here:
//  - dedup: two consumers of the SAME conversation, mounted together
//    (rail + overlay ClientInfo shape), share exactly one network fetch;
//  - TTL cache hit: a later consumer within the TTL window gets served
//    from cache with zero extra fetches;
//  - identityRefreshToken invalidation: a token bump forces a fresh fetch
//    even inside the TTL window — the EXISTING signal ClientIdentityDrawer
//    already bumps on a successful Find/Create link;
//  - retry(): bypasses the cache unconditionally and resolves once the
//    refreshed state has been applied (VisaFormDrawer's create-case flow
//    awaits this directly);
//  - 401 handling: redirects to /admin/login instead of surfacing a
//    provider-style error (incident 2026-09-18 discipline).

import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const pushMock = jest.fn()
// A STABLE router object matters here: the hook's internal `load` callback
// depends on `router`, and useRouter() in real Next.js returns a stable
// reference across renders. A fresh object literal per call would make
// `load` (and the effect that depends on it) re-run every render —
// self-triggering forever.
const routerMock = { push: pushMock }
jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}))

import { useClientContext, type ClientContextState } from '@/lib/inbox/useClientContext'

interface ProbeResult { state: ClientContextState; retry: () => Promise<void> }

function Probe({
  id, token, results, label,
}: { id: number | null; token: number; results: Record<string, ProbeResult>; label: string }) {
  const { state, retry } = useClientContext(id, token)
  results[label] = { state, retry }
  return null
}

function mountRoot() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return createRoot(container)
}

/** Flush the microtask queue (the fetch().then chain) and the resulting
 *  React state updates it schedules. */
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
}

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body }
}

beforeEach(() => {
  pushMock.mockClear()
  jest.restoreAllMocks()
})

describe('useClientContext — dedup across concurrent consumers', () => {
  it('two siblings asking for the SAME conversation (rail + overlay shape) share exactly one fetch', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(200, { context: { resolution: 'VERIFIED', application: null, link: null } }))
    global.fetch = fetchMock as unknown as typeof fetch

    const results: Record<string, ProbeResult> = {}
    const root = mountRoot()
    await act(async () => {
      root.render(
        <>
          <Probe id={9001} token={0} results={results} label="rail" />
          <Probe id={9001} token={0} results={results} label="overlay" />
        </>,
      )
    })
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(results.rail.state).toEqual({ phase: 'ready', context: { resolution: 'VERIFIED', application: null, link: null } })
    expect(results.overlay.state).toEqual(results.rail.state)
  })

  it('a drawer opened afterwards for the same conversation, within the TTL, reuses the cache — zero extra fetches', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(200, { context: { resolution: 'LINKED', application: null, link: null } }))
    global.fetch = fetchMock as unknown as typeof fetch

    const results: Record<string, ProbeResult> = {}
    const root = mountRoot()
    await act(async () => {
      root.render(<Probe id={9002} token={0} results={results} label="rail" />)
    })
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // A drawer for the SAME conversation mounts moments later (well inside
    // the 30s TTL) — matches PaymentRequestDrawer/CreateQuoteDrawer/
    // VisaFormDrawer/ItineraryRequestDrawer all opening for a conversation
    // the rail already resolved.
    await act(async () => {
      root.render(
        <>
          <Probe id={9002} token={0} results={results} label="rail" />
          <Probe id={9002} token={0} results={results} label="drawer" />
        </>,
      )
    })
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)   // still just the one
    expect(results.drawer.state).toEqual({ phase: 'ready', context: { resolution: 'LINKED', application: null, link: null } })
  })

  it('past the TTL, the next consumer refetches instead of serving stale data forever', async () => {
    let now = 1_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    const fetchMock = jest.fn(async () =>
      jsonResponse(200, { context: { resolution: 'VERIFIED', application: null, link: null } }))
    global.fetch = fetchMock as unknown as typeof fetch

    const results: Record<string, ProbeResult> = {}
    const root = mountRoot()
    await act(async () => { root.render(<Probe id={9003} token={0} results={results} label="a" />) })
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 31s later — past the hook's 30s TTL.
    now += 31_000
    await act(async () => {
      root.render(
        <>
          <Probe id={9003} token={0} results={results} label="a" />
          <Probe id={9003} token={0} results={results} label="b" />
        </>,
      )
    })
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('useClientContext — identityRefreshToken invalidation', () => {
  it('a token bump forces a fresh fetch even well within the TTL window (Find/Create link signal)', async () => {
    let callCount = 0
    const fetchMock = jest.fn(async () => {
      callCount += 1
      return jsonResponse(200, {
        context: { resolution: callCount === 1 ? 'UNRESOLVED' : 'LINKED', application: null, link: null },
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const results: Record<string, ProbeResult> = {}
    const root = mountRoot()
    await act(async () => { root.render(<Probe id={9004} token={0} results={results} label="a" />) })
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(results.a.state).toMatchObject({ phase: 'ready', context: { resolution: 'UNRESOLVED' } })

    // Page bumps identityRefreshToken after ClientIdentityDrawer's onLinked —
    // every consumer of this conversation must see the refreshed identity.
    await act(async () => { root.render(<Probe id={9004} token={1} results={results} label="a" />) })
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(results.a.state).toMatchObject({ phase: 'ready', context: { resolution: 'LINKED' } })
  })
})

describe('useClientContext — retry()', () => {
  it('bypasses the cache and resolves once the refreshed state is applied', async () => {
    let callCount = 0
    const fetchMock = jest.fn(async () => {
      callCount += 1
      return jsonResponse(200, {
        context: { resolution: callCount === 1 ? 'HEURISTIC' : 'VERIFIED', application: null, link: null },
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const results: Record<string, ProbeResult> = {}
    const root = mountRoot()
    await act(async () => { root.render(<Probe id={9005} token={0} results={results} label="a" />) })
    await flush()
    expect(results.a.state).toMatchObject({ context: { resolution: 'HEURISTIC' } })

    // retry() is awaited directly (VisaFormDrawer's create-case flow relies
    // on this to stop showing "Creating…" only once the new case is visible).
    await act(async () => { await results.a.retry() })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(results.a.state).toMatchObject({ phase: 'ready', context: { resolution: 'VERIFIED' } })
  })
})

describe('useClientContext — 401 handling', () => {
  it('an expired session redirects to /admin/login instead of surfacing a load error forever', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, { error: 'Unauthorized' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const results: Record<string, ProbeResult> = {}
    const root = mountRoot()
    await act(async () => { root.render(<Probe id={9006} token={0} results={results} label="a" />) })
    await flush()

    expect(pushMock).toHaveBeenCalledWith('/admin/login')
    // The hook still resolves to a terminal state (never an infinite
    // "loading" spinner) — same contract page.tsx's own 401 branches keep.
    expect(results.a.state.phase).toBe('error')
  })
})
