/**
 * Admin-wide Floating Team Hub — lib/team-hub-floating/persistence.ts.
 * Covers scenarios (4) close/reopen restores the same position/size and
 * (7) a saved layout persists across a refresh (both are the same
 * save -> load round trip from this module's point of view — the React
 * layer just decides WHEN to call each), plus the security/privacy
 * requirement that ONLY geometry is ever written to localStorage — never
 * message content, unread counts, or the selected conversation id.
 *
 * testEnvironment is 'node' (jest.config.ts) — there is no real
 * `localStorage`, so a minimal in-memory stand-in is installed on
 * `globalThis` for this file only, mirroring how a real browser's
 * Storage API behaves for get/set/remove.
 */
import type { Geometry } from '@/lib/team-hub-floating/geometry'

function installFakeLocalStorage() {
  const store = new Map<string, string>()
  const fake = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
  }
  ;(globalThis as unknown as { localStorage: typeof fake }).localStorage = fake
  return store
}

const GEOM: Geometry = { x: 300, y: 120, width: 720, height: 640 }
const GEOM_2: Geometry = { x: 50, y: 50, width: 500, height: 500 }

describe('lib/team-hub-floating/persistence', () => {
  let store: Map<string, string>

  beforeEach(() => {
    jest.resetModules()
    store = installFakeLocalStorage()
  })

  it('round-trips a saved geometry — scenarios (4)/(7): close/reopen and refresh both restore the same position/size', () => {
    const { savePersistedLayout, loadPersistedLayout } = require('@/lib/team-hub-floating/persistence')
    savePersistedLayout({ geometry: GEOM, lastNormalGeometry: GEOM })
    const loaded = loadPersistedLayout()
    expect(loaded).toEqual({ geometry: GEOM, lastNormalGeometry: GEOM })
  })

  it('keeps lastNormalGeometry independent of the current (possibly maximized-derived) geometry', () => {
    const { savePersistedLayout, loadPersistedLayout } = require('@/lib/team-hub-floating/persistence')
    savePersistedLayout({ geometry: GEOM_2, lastNormalGeometry: GEOM })
    const loaded = loadPersistedLayout()
    expect(loaded?.geometry).toEqual(GEOM_2)
    expect(loaded?.lastNormalGeometry).toEqual(GEOM)
  })

  it('returns null when nothing has been saved yet', () => {
    const { loadPersistedLayout } = require('@/lib/team-hub-floating/persistence')
    expect(loadPersistedLayout()).toBeNull()
  })

  it('returns null (never throws) for corrupt JSON', () => {
    const { loadPersistedLayout, FLOATING_LAYOUT_STORAGE_KEY } = require('@/lib/team-hub-floating/persistence')
    store.set(FLOATING_LAYOUT_STORAGE_KEY, '{not valid json')
    expect(loadPersistedLayout()).toBeNull()
  })

  it('returns null for a validly-shaped-but-wrong-typed payload (defensive against tampering, not just corruption)', () => {
    const { loadPersistedLayout, FLOATING_LAYOUT_STORAGE_KEY } = require('@/lib/team-hub-floating/persistence')
    store.set(FLOATING_LAYOUT_STORAGE_KEY, JSON.stringify({ geometry: { x: 'not-a-number', y: 1, width: 1, height: 1 }, lastNormalGeometry: GEOM }))
    expect(loadPersistedLayout()).toBeNull()
  })

  it('resetPersistedLayout clears the stored value', () => {
    const { savePersistedLayout, loadPersistedLayout, resetPersistedLayout } = require('@/lib/team-hub-floating/persistence')
    savePersistedLayout({ geometry: GEOM, lastNormalGeometry: GEOM })
    resetPersistedLayout()
    expect(loadPersistedLayout()).toBeNull()
  })

  it('SECURITY/PRIVACY: never persists anything beyond geometry — no conversation id, no message content, no unread count', () => {
    const { savePersistedLayout, FLOATING_LAYOUT_STORAGE_KEY } = require('@/lib/team-hub-floating/persistence')
    savePersistedLayout({ geometry: GEOM, lastNormalGeometry: GEOM })
    const raw = store.get(FLOATING_LAYOUT_STORAGE_KEY)!
    const parsed = JSON.parse(raw)
    expect(Object.keys(parsed).sort()).toEqual(['geometry', 'lastNormalGeometry'])
    expect(Object.keys(parsed.geometry).sort()).toEqual(['height', 'width', 'x', 'y'])
    expect(raw).not.toMatch(/conversation/i)
    expect(raw).not.toMatch(/unread/i)
    expect(raw).not.toMatch(/message/i)
  })

  it('save never throws even if localStorage.setItem throws (private browsing / quota exceeded)', () => {
    const { savePersistedLayout } = require('@/lib/team-hub-floating/persistence')
    ;(globalThis as unknown as { localStorage: Storage }).localStorage.setItem = () => { throw new Error('QuotaExceededError') }
    expect(() => savePersistedLayout({ geometry: GEOM, lastNormalGeometry: GEOM })).not.toThrow()
  })
})
