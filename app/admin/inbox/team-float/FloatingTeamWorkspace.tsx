'use client'

/**
 * Floating Ask Team Workspace — top-level presentation component.
 *
 * Mounted ONCE at the persistent Inbox shell tier (app/admin/inbox/
 * page.tsx's InboxPageInner, next to AskTeamPanel/JadeAssistPanel/
 * InboxJadeCopilot — see that file's own comment on why this tier never
 * unmounts on conversation switch, which is exactly why the floating
 * workspace survives switching the visible Inbox client). All state comes
 * from `useFloatingTeamWorkspace()`, called by the parent (page.tsx) so its
 * `askTeamFor` action is reachable from the Ask Team button's
 * ComposerDraftContext registration.
 *
 * Mounts `TeamCallDeviceProvider` + `IncomingCallOverlay` itself, exactly
 * once, ONLY while at least one discussion is open — never on every Inbox
 * page load — mirroring app/admin/team/page.tsx's own mount shape for
 * those two (see that file's header comment). `IncomingCallOverlay` is
 * rendered at this same level, never embedded inside the floating window,
 * per its own "full-viewport global overlay by design" contract.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TeamCallDeviceProvider } from '../../team/calls/useTeamCallDevice'
import { IncomingCallOverlay } from '../../team/calls/IncomingCallOverlay'
import { useCurrentStaff } from '../../team/hooks/useCurrentStaff'
import { useFloatBreakpoint } from './useBreakpoint'
import { FloatWindowChrome } from './FloatWindowChrome'
import { MinimizedBar } from './MinimizedBar'
import { MobileTeamSheet } from './MobileTeamSheet'
import { TabConversationHost } from './TabConversationHost'
import { isReplySafeForCurrentComposer, type FloatTab } from '@/lib/team-float/state'
import type { FloatingTeamWorkspaceApi } from './useFloatingTeamWorkspace'

export interface FloatingTeamWorkspaceProps {
  api: FloatingTeamWorkspaceApi
  /** The Inbox conversation currently visible on screen, or null. Never used to infer any tab's OWN linkage — only for the context-mismatch note and the Prepare Client Reply safety gate. */
  viewingInboxConversationId: number | null
  viewingClientName: string | null
  /** Navigates the Inbox to a conversation by id, reusing the existing Inbox selection/authorization path — never a new/duplicate Inbox view. */
  onNavigateToInbox: (inboxConversationId: number) => void
}

export function FloatingTeamWorkspace({ api, viewingInboxConversationId, viewingClientName, onNavigateToInbox }: FloatingTeamWorkspaceProps) {
  const breakpoint = useFloatBreakpoint()
  const { staff } = useCurrentStaff()
  const [announce, setAnnounce] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Stable off-screen host for every open tab's TabConversationHost — see
  // the header comment: this workspace must not stop polling for unread
  // messages just because the window is minimized, or lose scroll/thread
  // state just because the mobile/desktop chrome swaps. The visible chrome
  // (FloatWindowChrome/MobileTeamSheet) reports its own body DOM node via
  // `bodySlotRef`; a SINGLE `createPortal(body, target)` call, always made
  // from the same position in the React tree with the same element keys,
  // moves the underlying DOM without ever unmounting the hosts — target is
  // this hidden node whenever no visible slot exists (minimized).
  const [visibleSlot, setVisibleSlot] = useState<HTMLDivElement | null>(null)
  const hiddenHostRef = useRef<HTMLDivElement | null>(null)
  if (typeof document !== 'undefined' && !hiddenHostRef.current) {
    const el = document.createElement('div')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;pointer-events:none;'
    hiddenHostRef.current = el
  }
  useEffect(() => {
    const el = hiddenHostRef.current
    if (el) document.body.appendChild(el)
    return () => { el?.remove() }
  }, [])
  const bodySlotRef = useCallback((el: HTMLDivElement | null) => setVisibleSlot(el), [])

  const {
    tabs, activeTabId, minimized, maximized, geometry, bounds, hydrated,
    focusTab, closeTab, minimize, restore, toggleMaximize,
    moveBy, resizeByHandle, resetPosition, reportUnread, unreadByTab, totalUnread,
  } = api

  const goToLinkedConversation = useCallback((inboxConversationId: number) => {
    onNavigateToInbox(inboxConversationId)
  }, [onNavigateToInbox])

  const handleCloseActiveTab = useCallback(() => {
    if (activeTabId) closeTab(activeTabId)
  }, [activeTabId, closeTab])

  // Screen-reader announcement on minimize/restore/maximize — the workspace
  // has no route change to hang a page-title announcement off, so this is
  // explicit (a11y requirement: "screen-reader-announced title").
  useEffect(() => {
    if (!hydrated) return
    if (minimized) setAnnounce('Team Hub workspace minimized.')
    else if (maximized) setAnnounce('Team Hub workspace maximized.')
    else setAnnounce('Team Hub workspace restored.')
  }, [minimized, maximized, hydrated])

  // Accessibility: "sensible Escape behavior" — Escape while focus is
  // somewhere INSIDE the floating workspace minimizes it (never closes/
  // discards a discussion — that stays an explicit, separate action) so a
  // keyboard user always has a fast, non-destructive way out. Scoped to
  // focus-within rather than a global document listener with no guard, so
  // it never steals Escape from an unrelated open overlay (e.g. a Client
  // Action Centre drawer) elsewhere on the Inbox page.
  useEffect(() => {
    if (minimized) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const container = containerRef.current
      if (container && document.activeElement instanceof Node && container.contains(document.activeElement)) {
        minimize()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [minimized, minimize])

  if (!hydrated || tabs.length === 0) return null

  const activeTab: FloatTab | null = tabs.find(t => t.id === activeTabId) ?? tabs[0] ?? null
  const activeTabIsViewingLinked = activeTab
    ? isReplySafeForCurrentComposer(activeTab.inboxConversationId, viewingInboxConversationId)
    : false

  const body = tabs.map(t => (
    <TabConversationHost
      key={t.id}
      tab={t}
      active={t.id === (activeTab?.id ?? null)}
      currentStaff={staff}
      viewingInboxConversationId={viewingInboxConversationId}
      onGoToLinkedConversation={goToLinkedConversation}
      onReportUnread={reportUnread}
    />
  ))

  const portalTarget = (!minimized && visibleSlot) ? visibleSlot : hiddenHostRef.current

  return (
    <TeamCallDeviceProvider>
      <IncomingCallOverlay />
      <div role="status" aria-live="polite" className="sr-only">{announce}</div>

      {/* Always mounted from this SAME position with the SAME keys — only
          the portal's target DOM node changes, so minimizing/restoring or
          switching mobile<->desktop chrome never unmounts a single open
          tab's live conversation state/poll. */}
      {portalTarget && createPortal(body, portalTarget)}

      {minimized ? (
        <MinimizedBar tabs={tabs} totalUnread={totalUnread} onRestore={restore} />
      ) : (
        <div ref={containerRef}>
          {breakpoint === 'mobile' ? (
            <MobileTeamSheet
              tabs={tabs}
              activeTabId={activeTab?.id ?? null}
              unreadByTab={unreadByTab}
              viewingClientName={viewingClientName}
              isViewingActiveTabsClient={activeTabIsViewingLinked}
              onFocusTab={focusTab}
              onCloseTab={closeTab}
              onClose={minimize}
              onCloseActiveTab={handleCloseActiveTab}
              onGoToLinkedConversation={goToLinkedConversation}
              bodySlotRef={bodySlotRef}
            />
          ) : (
            <FloatWindowChrome
              tabs={tabs}
              activeTabId={activeTab?.id ?? null}
              unreadByTab={unreadByTab}
              geometry={geometry}
              maximized={maximized}
              bounds={bounds}
              viewingClientName={viewingClientName}
              isViewingActiveTabsClient={activeTabIsViewingLinked}
              onFocusTab={focusTab}
              onCloseTab={closeTab}
              onMinimize={minimize}
              onToggleMaximize={toggleMaximize}
              onClose={handleCloseActiveTab}
              onDragBy={moveBy}
              onResizeByHandle={resizeByHandle}
              onResetPosition={resetPosition}
              onGoToLinkedConversation={goToLinkedConversation}
              bodySlotRef={bodySlotRef}
            />
          )}
        </div>
      )}
    </TeamCallDeviceProvider>
  )
}
