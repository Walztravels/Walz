'use client'

// useInboxScreens — INBOX UX-4 mobile screen-state navigation.
//
// Owns:
//  - screen state 'list' | 'chat'. Client details is an OVERLAY state
//    (`detailsOpen` boolean hosted here so it can be force-closed on every
//    screen change), never a third exclusive screen.
//  - URL + history integration: selecting a conversation pushes `?c=<convId>`
//    (window.history.pushState with a { walzInbox: true } marker — supported
//    shallow routing in Next 14 App Router). On popstate the screen derives
//    from the URL (no ?c → list; ?c → chat with that conversation if loaded),
//    so BROWSER BACK goes chat → list inside the inbox instead of leaving
//    /admin/inbox. The in-app back button calls history.back() when the top
//    entry is ours, keeping both navigations consistent; if the entry is not
//    ours (deep link / reload landed directly on ?c=), it falls back to a
//    direct state change + replaceState.
//  - List scroll restoration: the list column stays MOUNTED below md
//    (transforms, not display:none), but scrollTop is still saved before
//    leaving the list and restored after returning (rAF after paint) as a
//    guard against reflows while the pane is off-screen.
//
// The legacy `?lead=` param stays readable on first load — the page's
// existing read-once effect handles it and funnels into selectConversation,
// which rewrites the URL to the canonical `?c=` form.

import { useCallback, useEffect, useRef, useState } from 'react'

export type InboxScreen = 'list' | 'chat'

/** Canonical conversation URL param (UX-4). `?lead=` remains read-only legacy. */
export const CONV_PARAM = 'c'
/** history.state marker: entries pushed by this hook carry { walzInbox: true }. */
export const HISTORY_MARKER = 'walzInbox'

// ─── Pure helpers (unit-tested in inbox-ux4-screens) ─────────────────────────

/** Derive the screen (and conversation id, if any) from a URL search string. */
export function deriveScreenFromSearch(search: string): { screen: InboxScreen; convId: number | null } {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const raw = params.get(CONV_PARAM)
    if (raw && /^\d+$/.test(raw)) return { screen: 'chat', convId: Number(raw) }
  } catch { /* malformed search → list */ }
  return { screen: 'list', convId: null }
}

/**
 * Build the next search string for a conversation selection (or null to clear).
 * Preserves unrelated params; drops the legacy `lead` param once superseded.
 */
export function buildConvSearch(search: string, convId: number | null): string {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  } catch {
    params = new URLSearchParams()
  }
  params.delete('lead')
  if (convId == null) params.delete(CONV_PARAM)
  else params.set(CONV_PARAM, String(convId))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Save/restore bookkeeping for the list scroller across screen changes. */
export function createListScrollMemory() {
  let savedTop = 0
  return {
    get saved() { return savedTop },
    save(el: { scrollTop: number } | null | undefined) {
      if (el) savedTop = el.scrollTop
    },
    restore(el: { scrollTop: number } | null | undefined) {
      if (el) el.scrollTop = savedTop
    },
  }
}

/**
 * Toggle inertness on an off-screen pane: aria is handled by the caller's
 * aria-hidden attr; this sets the DOM `inert` property (focus + AT + pointer)
 * with a safe cast for older lib.dom typings and a no-op on null.
 */
export function applyInert(el: { inert?: boolean } | null | undefined, inert: boolean) {
  if (!el) return
  try { (el as { inert: boolean }).inert = inert } catch { /* unsupported → aria-hidden still applies */ }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface InboxScreensApi {
  screen: InboxScreen
  /** Client-details drawer overlay (below lg). Closed on every screen change. */
  detailsOpen: boolean
  openDetails: () => void
  closeDetails: () => void
  /** URL push (?c=<convId>) + screen → chat. Call AFTER applying selection state. */
  selectConversation: (convId: number) => void
  /** In-app back: history.back() when the entry is ours, else direct fallback. */
  back: () => void
  /** Register the conversation-list scroll container for save/restore. */
  registerListScroller: (el: HTMLElement | null) => void
}

export function useInboxScreens(opts: {
  /**
   * popstate landed on ?c=<convId>: select that conversation WITHOUT pushing
   * history. Return true if it is loaded and selected (else we stay on list).
   */
  onNavigateToConv?: (convId: number) => boolean
} = {}): InboxScreensApi {
  const [screen, setScreenState] = useState<InboxScreen>('list')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const screenRef = useRef<InboxScreen>('list')
  const navRef = useRef(opts.onNavigateToConv)
  navRef.current = opts.onNavigateToConv
  const scrollerRef = useRef<HTMLElement | null>(null)
  const memoryRef = useRef(createListScrollMemory())

  const setScreen = useCallback((next: InboxScreen) => {
    if (screenRef.current === next) return
    if (next === 'chat') memoryRef.current.save(scrollerRef.current) // save before leaving the list
    screenRef.current = next
    setScreenState(next)
    setDetailsOpen(false) // overlays never survive a screen change
    if (next === 'list' && typeof window !== 'undefined') {
      // Restore after paint — rAF so the returning pane has laid out.
      window.requestAnimationFrame(() => memoryRef.current.restore(scrollerRef.current))
    }
  }, [])

  // Browser Back/Forward: derive the screen from the URL.
  useEffect(() => {
    const onPop = () => {
      const { screen: next, convId } = deriveScreenFromSearch(window.location.search)
      if (next === 'chat' && convId != null) {
        const found = navRef.current ? navRef.current(convId) : true
        setScreen(found ? 'chat' : 'list')
      } else {
        setScreen('list')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [setScreen])

  const selectConversation = useCallback((convId: number) => {
    try {
      const current = deriveScreenFromSearch(window.location.search)
      if (current.convId !== convId) {
        const url = `${window.location.pathname}${buildConvSearch(window.location.search, convId)}`
        window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_MARKER]: true }, '', url)
      }
    } catch { /* history unavailable — screen state still moves */ }
    setScreen('chat')
  }, [setScreen])

  const back = useCallback(() => {
    let ours = false
    try { ours = window.history.state?.[HISTORY_MARKER] === true } catch { /* not ours */ }
    if (ours) {
      // Pop our entry — the popstate handler flips the screen, so browser
      // Back and the in-app back button walk the same history.
      window.history.back()
      return
    }
    // Deep link / reload landed directly on ?c= — fall back to a direct
    // state change and clean the URL in place (no history entry to pop).
    try {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${buildConvSearch(window.location.search, null)}`,
      )
    } catch { /* URL cleanup is best-effort */ }
    setScreen('list')
  }, [setScreen])

  const registerListScroller = useCallback((el: HTMLElement | null) => {
    scrollerRef.current = el
  }, [])

  const openDetails = useCallback(() => setDetailsOpen(true), [])
  const closeDetails = useCallback(() => setDetailsOpen(false), [])

  return { screen, detailsOpen, openDetails, closeDetails, selectConversation, back, registerListScroller }
}
