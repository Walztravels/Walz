'use client'

/**
 * Floating Ask Team Workspace — mobile (<768px) presentation. No free-
 * floating draggable/resizable window below this breakpoint (per spec) —
 * a full-screen overlay instead, mirroring AskTeamPanel.tsx's own existing
 * mobile precedent (that drawer is already `w-full` with no `max-w-*` cap
 * below `sm`, i.e. already full-screen on a phone).
 */
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { Z_INDEX } from '@/lib/admin/chrome'
import type { FloatTab } from '@/lib/team-float/state'

export interface MobileTeamSheetProps {
  tabs: FloatTab[]
  activeTabId: string | null
  unreadByTab: Record<string, number>
  viewingClientName: string | null
  isViewingActiveTabsClient: boolean
  onFocusTab: (id: string) => void
  onCloseTab: (id: string) => void
  /** "Back" affordance — minimizes the workspace (returns to browsing the Inbox) without discarding any open discussion. Never confused with onCloseActiveTab below. */
  onClose: () => void
  /** The "X" affordance — actually closes the active discussion tab (mirrors FloatWindowChrome's header X via handleCloseActiveTab), not merely minimize. If it's the last open tab, the whole workspace closes (FloatingTeamWorkspace returns null once tabs.length === 0). */
  onCloseActiveTab: () => void
  onGoToLinkedConversation: (inboxConversationId: number) => void
  /** See FloatWindowChrome's identical prop — body content arrives via portal, never as `children`, so it survives this sheet unmounting (e.g. switching to desktop breakpoint) without losing its live poll/scroll state. */
  bodySlotRef: (el: HTMLDivElement | null) => void
}

export function MobileTeamSheet({
  tabs, activeTabId, unreadByTab, viewingClientName, isViewingActiveTabsClient,
  onFocusTab, onCloseTab, onClose, onCloseActiveTab, onGoToLinkedConversation, bodySlotRef,
}: MobileTeamSheetProps) {
  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0] ?? null

  // Roving-tabindex tablist keyboard support — identical WAI-ARIA Tabs
  // pattern (automatic activation) as FloatWindowChrome's desktop tab bar.
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  function handleTabListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (tabs.length === 0) return
    const currentIdx = Math.max(0, tabs.findIndex(t => t.id === activeTabId))
    let nextIdx: number | null = null
    if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % tabs.length
    else if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = tabs.length - 1
    if (nextIdx === null) return
    e.preventDefault()
    const nextTab = tabs[nextIdx]
    onFocusTab(nextTab.id)
    tabRefs.current.get(nextTab.id)?.focus()
  }

  return (
    <div
      role="region"
      aria-label={activeTab ? `Team Hub — linked to ${activeTab.clientName}` : 'Team Hub'}
      className="fixed inset-0 bg-white flex flex-col"
      style={{ zIndex: Z_INDEX.drawer }}
    >
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-3 border-b border-walz-border">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onClose} aria-label="Back to Inbox" className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center text-walz-navy">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <p className="text-sm font-bold text-walz-deep-navy truncate">Team Hub</p>
        </div>
        <button onClick={onCloseActiveTab} aria-label="Close current Team Hub discussion tab" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-walz-muted-strong hover:text-walz-navy">
          <X className="w-5 h-5" />
        </button>
      </div>

      {tabs.length > 0 && (
        <div
          role="tablist"
          aria-label="Open Team Hub discussions"
          className="flex-shrink-0 flex items-center gap-1 px-2 py-2 border-b border-walz-border overflow-x-auto"
          onKeyDown={handleTabListKeyDown}
        >
          {tabs.map(t => {
            const unread = unreadByTab[t.id] ?? 0
            const isActive = t.id === activeTabId
            return (
              <div
                key={t.id}
                ref={el => { if (el) tabRefs.current.set(t.id, el); else tabRefs.current.delete(t.id) }}
                role="tab"
                id={`float-tab-${t.id}`}
                aria-selected={isActive}
                aria-controls={`float-tabpanel-${t.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`flex-shrink-0 flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold min-h-[44px] cursor-pointer ${isActive ? 'bg-walz-navy text-white' : 'bg-walz-off-white text-walz-navy border border-walz-border'}`}
                onClick={() => onFocusTab(t.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocusTab(t.id) } }}
              >
                <span className="truncate max-w-[100px]">{t.clientName}</span>
                {unread > 0 && (
                  <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Close ${t.clientName} discussion tab`}
                  onClick={e => { e.stopPropagation(); onCloseTab(t.id) }}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {activeTab && (
        <div className="flex-shrink-0 px-3 py-2 bg-walz-gold/10 border-b border-walz-gold/30 text-xs flex items-center justify-between gap-2">
          <button type="button" onClick={() => onGoToLinkedConversation(activeTab.inboxConversationId)} className="font-semibold text-walz-navy truncate min-h-[44px] flex items-center">
            Linked to: {activeTab.clientName} · {activeTab.clientRef}
          </button>
          {!isViewingActiveTabsClient && viewingClientName && (
            <span className="text-walz-muted-strong flex-shrink-0 truncate" role="status">Viewing {viewingClientName}</span>
          )}
        </div>
      )}

      <div ref={bodySlotRef} className="flex-1 min-h-0 flex flex-col" />
    </div>
  )
}
