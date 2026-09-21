'use client'

/**
 * Floating Ask Team Workspace — the top-level state hook, mounted ONCE at
 * the persistent Inbox shell tier (app/admin/inbox/page.tsx's
 * InboxPageInner, alongside AskTeamPanel/JadeAssistPanel/InboxJadeCopilot —
 * see that file's own comment on why this tier never unmounts per
 * conversation switch). All geometry/tab/case-resolution LOGIC lives in the
 * framework-free lib/team-float/state.ts; this hook is the thin React glue:
 * owns the state, persists it to localStorage (STORAGE_KEY, UI-only, no DB
 * model — see state.ts's header), measures the Inbox's own usable viewport,
 * and exposes the actions the chrome components/page.tsx need.
 *
 * SECURITY NOTE: nothing here is an authorization boundary. `tabs` (and the
 * persisted copy of them) only ever say "please render this Team
 * conversation id" — every actual read still goes through
 * useSelectedConversation's real, unmodified server-side membership check
 * (see that hook's forbidden/notFound handling), so a tampered/edited
 * localStorage entry for a conversation the signed-in staff member isn't a
 * member of renders the existing "you don't have access" state, never
 * content. See lib/team-float/state.ts's header for the full argument.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Bounds, type FloatGeometry, type FloatTab, type ResizeHandle, type AskTeamResolution,
  defaultGeometry, clampGeometry, dragBy, resizeBy,
  upsertTab, removeTab, nextActiveAfterClose,
  resolveAskTeamCase, restoreClamped, serializeFloatState, STORAGE_KEY,
} from '@/lib/team-float/state'

export interface AskTeamMeta {
  inboxConversationId: number
  clientName: string
  clientRef: string
}

export interface FloatingTeamWorkspaceApi {
  tabs: FloatTab[]
  activeTabId: string | null
  minimized: boolean
  maximized: boolean
  geometry: FloatGeometry
  bounds: Bounds
  hydrated: boolean

  /** "Ask Team" entry point — resolves CASE 1/2/3. CASE 3 is returned so the caller opens the existing AskTeamPanel create flow; CASE 1/2 are handled entirely here (focus/open + un-minimize). */
  askTeamFor: (meta: AskTeamMeta) => Promise<AskTeamResolution>
  /** Called once AskTeamPanel's EXISTING create flow (CASE 3) finishes — adds the resulting real TeamConversation as a tab. Never creates a second TeamConversation itself. */
  openCreatedTab: (tab: FloatTab) => void

  focusTab: (tabId: string) => void
  closeTab: (tabId: string) => void
  minimize: () => void
  restore: () => void
  toggleMaximize: () => void

  moveBy: (dx: number, dy: number) => void
  resizeByHandle: (handle: ResizeHandle, dx: number, dy: number) => void
  resetPosition: () => void

  reportUnread: (tabId: string, count: number) => void
  unreadByTab: Record<string, number>
  totalUnread: number
}

function computeBounds(): Bounds {
  if (typeof window === 'undefined') return { top: 0, left: 0, right: 1024, bottom: 768 }
  const el = document.querySelector('[data-inbox-fullbleed]') as HTMLElement | null
  if (el) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) {
      return { top: r.top, left: r.left, right: r.right, bottom: r.bottom }
    }
  }
  return { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight }
}

export function useFloatingTeamWorkspace(): FloatingTeamWorkspaceApi {
  const [bounds, setBounds] = useState<Bounds>(() => computeBounds())
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds

  const [tabs, setTabs] = useState<FloatTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [geometry, setGeometry] = useState<FloatGeometry>(() => defaultGeometry(computeBounds()))
  const [hydrated, setHydrated] = useState(false)
  const [unreadByTab, setUnreadByTab] = useState<Record<string, number>>({})

  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const geometryRef = useRef(geometry)
  geometryRef.current = geometry

  // ── Hydrate from localStorage once, clamped to the CURRENT viewport ──────
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const restored = restoreClamped(raw, computeBounds())
      if (restored) {
        setTabs(restored.tabs)
        setActiveTabId(restored.activeTabId)
        setMinimized(restored.minimized)
        setMaximized(restored.maximized)
        setGeometry(restored.geometry)
        setUnreadByTab(Object.fromEntries(restored.tabs.map(t => [t.id, 0])))
      }
    } catch { /* localStorage unavailable (private mode/quota) — start fresh, non-fatal */ }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Recompute bounds on viewport resize; reclamp geometry so a shrink never leaves the window off-screen ──
  useEffect(() => {
    function onResize() {
      const next = computeBounds()
      setBounds(next)
      setGeometry(g => clampGeometry(g, next))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Persist (debounced via rAF-style microtask coalescing is unnecessary here — writes are cheap and infrequent outside drag/resize, which callers throttle to pointerup) ──
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeFloatState({ tabs, activeTabId, minimized, maximized, geometry }))
    } catch { /* best-effort — window state simply doesn't survive a refresh this time */ }
  }, [hydrated, tabs, activeTabId, minimized, maximized, geometry])

  const focusTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
    setMinimized(false)
  }, [])

  const openCreatedTab = useCallback((tab: FloatTab) => {
    setTabs(prev => upsertTab(prev, tab))
    setActiveTabId(tab.id)
    setMinimized(false)
  }, [])

  const askTeamFor = useCallback(async (meta: AskTeamMeta): Promise<AskTeamResolution> => {
    const local = resolveAskTeamCase(tabsRef.current, meta.inboxConversationId, null)
    if (local.case === 1) {
      focusTab(local.tab.id)
      return local
    }
    try {
      const res = await fetch(`/api/admin/team/inbox-links/for-conversation?inboxConversationId=${meta.inboxConversationId}`)
      const data = res.ok ? (await res.json() as { link: { teamConversationId: string } | null }) : { link: null }
      const resolution = resolveAskTeamCase(tabsRef.current, meta.inboxConversationId, data.link?.teamConversationId ?? null)
      if (resolution.case === 2) {
        openCreatedTab({
          id: resolution.teamConversationId,
          inboxConversationId: meta.inboxConversationId,
          clientName: meta.clientName,
          clientRef: meta.clientRef,
        })
      }
      return resolution
    } catch {
      // Lookup failed (network) — fail safe to CASE 3 (the existing create
      // flow) rather than silently doing nothing; never fabricates a link.
      return { case: 3 }
    }
  }, [focusTab, openCreatedTab])

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => removeTab(prev, tabId))
    setActiveTabId(prev => nextActiveAfterClose(tabsRef.current, tabId, prev))
    setUnreadByTab(prev => {
      if (!(tabId in prev)) return prev
      const next = { ...prev }
      delete next[tabId]
      return next
    })
  }, [])

  const minimize = useCallback(() => setMinimized(true), [])
  const restore = useCallback(() => setMinimized(false), [])
  const toggleMaximize = useCallback(() => setMaximized(m => !m), [])

  const moveBy = useCallback((dx: number, dy: number) => {
    setGeometry(g => dragBy(g, dx, dy, boundsRef.current))
  }, [])

  const resizeByHandle = useCallback((handle: ResizeHandle, dx: number, dy: number) => {
    setGeometry(g => resizeBy(g, handle, dx, dy, boundsRef.current))
  }, [])

  const resetPosition = useCallback(() => {
    setGeometry(defaultGeometry(boundsRef.current))
  }, [])

  const reportUnread = useCallback((tabId: string, count: number) => {
    setUnreadByTab(prev => (prev[tabId] === count ? prev : { ...prev, [tabId]: count }))
  }, [])

  const totalUnread = useMemo(
    () => tabs.reduce((sum, t) => sum + (unreadByTab[t.id] ?? 0), 0),
    [tabs, unreadByTab],
  )

  return {
    tabs, activeTabId, minimized, maximized, geometry, bounds, hydrated,
    askTeamFor, openCreatedTab,
    focusTab, closeTab, minimize, restore, toggleMaximize,
    moveBy, resizeByHandle, resetPosition,
    reportUnread, unreadByTab, totalUnread,
  }
}
