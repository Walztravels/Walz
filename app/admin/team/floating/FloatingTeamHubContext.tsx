'use client'

/**
 * Admin-wide Floating Team Hub — the context that holds everything the
 * floating window's visual state needs, mounted ONCE at the Admin
 * shell/layout level (see app/admin/layout.tsx) so it survives navigation
 * between ordinary Admin pages (Visa Applications -> Quotes -> Clients -> …)
 * without unmounting — the core "Admin navigation persistence" requirement.
 *
 * Deliberately holds ONLY UI/window state:
 *   - windowState ('closed' | 'open' | 'minimized') and isMaximized
 *   - the normal-mode geometry (position/size) — persisted to localStorage
 *     via lib/team-hub-floating/persistence.ts
 *   - the selected conversation id — kept in memory only (React state), per
 *     the product spec's "open/minimized state and active conversation are
 *     fine as session-level" — it resets on a hard reload rather than
 *     surviving in localStorage, and is NEVER treated as authorization by
 *     itself (every read is re-checked server-side regardless — see
 *     __tests__/team-hub-floating-tamper.test.ts)
 *   - the shared unread count (hooks/useTeamHubUnreadCount.ts — one poller,
 *     reused by both the sidebar badge and the minimized bar's badge)
 *
 * It does NOT hold conversation/message data itself — that stays entirely
 * inside the existing Team Hub hooks (useTeamConversations,
 * useSelectedConversation, …), instantiated only while the window is
 * actually open (see FloatingTeamHubContent.tsx) so nothing here spins up a
 * second poller stack for the same data `/admin/team` already fetches.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import {
  clampGeometry, defaultGeometry, type Bounds, type Geometry,
} from '@/lib/team-hub-floating/geometry'
import { loadPersistedLayout, savePersistedLayout } from '@/lib/team-hub-floating/persistence'
import {
  openOrRestoreState, minimizeState, closeState, toggleMaximizeState,
  type FloatingWindowState, type FloatingHubState,
} from '@/lib/team-hub-floating/windowState'
import { useTeamHubUnreadCount } from '@/hooks/useTeamHubUnreadCount'

export type { FloatingWindowState }

export interface FloatingTeamHubContextValue {
  windowState: FloatingWindowState
  isMaximized: boolean
  /** Always the NORMAL (non-maximized) geometry — frozen while maximized so
   * "restore" returns to the exact prior position/size. */
  geometry: Geometry
  selectedConversationId: string | null
  unreadCount: number
  isOpen: boolean
  isMinimized: boolean
  openOrRestore: () => void
  minimize: () => void
  close: () => void
  toggleMaximize: () => void
  /** Persist a new normal-mode geometry (drag/resize end, or an explicit reset). */
  commitGeometry: (g: Geometry) => void
  /** Live-update geometry during an in-progress drag/resize WITHOUT persisting yet. */
  previewGeometry: (g: Geometry) => void
  resetPosition: () => void
  resetSize: () => void
  selectConversation: (id: string | null) => void
  getContentAreaBounds: () => Bounds
}

const FloatingTeamHubContext = createContext<FloatingTeamHubContextValue | null>(null)

/** The Admin content-area element is marked with this attribute on the
 * existing <main> in app/admin/layout.tsx — a one-attribute addition, zero
 * behavior change — so the floating window can clamp/maximize against the
 * REAL visible content area (excludes sidebar + header/footer chrome) at
 * every screen size, without hard-coding any of those chrome dimensions. */
const CONTENT_AREA_SELECTOR = '[data-admin-content-area]'

function measureBounds(): Bounds {
  if (typeof window === 'undefined') return { left: 0, top: 0, right: 1280, bottom: 800 }
  const el = document.querySelector(CONTENT_AREA_SELECTOR)
  if (el) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) {
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
  }
  // Fallback (content area not yet mounted/measurable) — the full viewport,
  // re-clamped the moment a real measurement is available (resize/mount effects).
  return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
}

const INITIAL_HUB_STATE: FloatingHubState = { windowState: 'closed', isMaximized: false }

export function FloatingTeamHubProviderState({ children }: { children: ReactNode }) {
  const [hubState, setHubState] = useState<FloatingHubState>(INITIAL_HUB_STATE)
  const { windowState, isMaximized } = hubState
  const [geometry, setGeometry] = useState<Geometry>(() => defaultGeometry(measureBounds()))
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const lastNormalRef = useRef<Geometry>(geometry)
  const hydratedRef = useRef(false)
  const unreadCount = useTeamHubUnreadCount()

  // Hydrate from localStorage once on mount (client-only), clamped into the
  // CURRENT content-area bounds — a value saved on a large monitor is never
  // trusted as-is (test: "shrinking the viewport clamps back into bounds").
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    const bounds = measureBounds()
    const persisted = loadPersistedLayout()
    if (persisted) {
      const geom = clampGeometry(persisted.geometry, bounds)
      const lastNormal = clampGeometry(persisted.lastNormalGeometry, bounds)
      setGeometry(geom)
      lastNormalRef.current = lastNormal
    } else {
      const geom = defaultGeometry(bounds)
      setGeometry(geom)
      lastNormalRef.current = geom
    }
  }, [])

  // Re-clamp on every viewport resize so a move from a large monitor to a
  // laptop never leaves the window off-screen/unreachable.
  useEffect(() => {
    function onResize() {
      const bounds = measureBounds()
      setGeometry(prev => {
        const clamped = clampGeometry(prev, bounds)
        lastNormalRef.current = clampGeometry(lastNormalRef.current, bounds)
        savePersistedLayout({ geometry: clamped, lastNormalGeometry: lastNormalRef.current })
        return clamped
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const openOrRestore = useCallback(() => setHubState(openOrRestoreState), [])
  const minimize = useCallback(() => setHubState(minimizeState), [])
  const close = useCallback(() => setHubState(closeState), [])
  const toggleMaximize = useCallback(() => setHubState(toggleMaximizeState), [])

  const commitGeometry = useCallback((g: Geometry) => {
    const bounds = measureBounds()
    const clamped = clampGeometry(g, bounds)
    setGeometry(clamped)
    lastNormalRef.current = clamped
    savePersistedLayout({ geometry: clamped, lastNormalGeometry: clamped })
  }, [])

  const previewGeometry = useCallback((g: Geometry) => setGeometry(g), [])

  const resetPosition = useCallback(() => {
    const bounds = measureBounds()
    const def = defaultGeometry(bounds)
    setGeometry(prev => {
      const next = clampGeometry({ ...prev, x: def.x, y: def.y }, bounds)
      lastNormalRef.current = next
      savePersistedLayout({ geometry: next, lastNormalGeometry: next })
      return next
    })
  }, [])

  const resetSize = useCallback(() => {
    const bounds = measureBounds()
    const def = defaultGeometry(bounds)
    setGeometry(prev => {
      const next = clampGeometry({ ...prev, width: def.width, height: def.height }, bounds)
      lastNormalRef.current = next
      savePersistedLayout({ geometry: next, lastNormalGeometry: next })
      return next
    })
  }, [])

  const selectConversation = useCallback((id: string | null) => setSelectedConversationId(id), [])

  const value = useMemo<FloatingTeamHubContextValue>(() => ({
    windowState,
    isMaximized,
    geometry,
    selectedConversationId,
    unreadCount,
    isOpen: windowState === 'open',
    isMinimized: windowState === 'minimized',
    openOrRestore,
    minimize,
    close,
    toggleMaximize,
    commitGeometry,
    previewGeometry,
    resetPosition,
    resetSize,
    selectConversation,
    getContentAreaBounds: measureBounds,
  }), [
    windowState, isMaximized, geometry, selectedConversationId, unreadCount,
    openOrRestore, minimize, close, toggleMaximize, commitGeometry, previewGeometry, resetPosition, resetSize, selectConversation,
  ])

  return <FloatingTeamHubContext.Provider value={value}>{children}</FloatingTeamHubContext.Provider>
}

/** Throws outside a provider — for consumers that only ever render inside one (the floating window UI itself). */
export function useFloatingTeamHub(): FloatingTeamHubContextValue {
  const ctx = useContext(FloatingTeamHubContext)
  if (!ctx) throw new Error('useFloatingTeamHub() must be used within <FloatingTeamHubProviderState>')
  return ctx
}

/** Safe outside a provider (returns null) — for consumers like AdminSidebar
 * that must keep working even if rendered without the provider mounted. */
export function useFloatingTeamHubOptional(): FloatingTeamHubContextValue | null {
  return useContext(FloatingTeamHubContext)
}

/**
 * The Team Hub unread count for consumers OUTSIDE the floating window
 * itself (currently: components/admin/AdminSidebar.tsx) — reads the count
 * from THIS provider's own useTeamHubUnreadCount() poll (the `unreadCount`
 * already in context, above) when the provider is mounted, which is true
 * for every real Admin route (app/admin/layout.tsx wraps the whole shell in
 * <FloatingTeamHubProvider> unconditionally, for every signed-in session).
 *
 * Falls back to its own independent poll only on some render path where the
 * provider genuinely isn't mounted — defensive, not expected to be
 * reachable today, but a consumer must never crash or show a
 * permanently-zero badge just because it happens to render outside the
 * provider. That fallback poll is disabled (skips its fetch/interval
 * entirely — see hooks/useTeamHubUnreadCount.ts's `enabled` param) whenever
 * the shared context IS available, so there is always exactly ONE live 45s
 * poller for this data, never two independent ones running at once.
 */
export function useSharedTeamHubUnreadCount(): number {
  const ctx = useContext(FloatingTeamHubContext)
  const fallback = useTeamHubUnreadCount(ctx === null)
  return ctx ? ctx.unreadCount : fallback
}
