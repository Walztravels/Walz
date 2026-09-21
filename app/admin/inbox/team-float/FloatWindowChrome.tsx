'use client'

/**
 * Floating Ask Team Workspace — desktop/tablet window chrome: drag handle
 * (header only — interactive controls inside it are excluded from starting
 * a drag, see useDragHandle's INTERACTIVE_SELECTOR guard), resize edges/
 * corners, tabs bar, the "Linked to {Client} · {ref}" / context-mismatch
 * row, and minimize/maximize/close controls. All geometry math is the pure,
 * independently-tested functions in lib/team-float/state.ts — this
 * component only wires pointer events to them.
 */
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Maximize2, Minimize2, Minus, RotateCcw, X } from 'lucide-react'
import { useDragHandle, useResizeHandle } from './useDragResize'
import type { Bounds, FloatGeometry, FloatTab, ResizeHandle } from '@/lib/team-float/state'
import { Z_INDEX } from '@/lib/admin/chrome'

// lib/admin/chrome.ts's Z_INDEX.inboxFloatingPanel (62) — one step above the
// shared drawer layer (60) so the floating workspace sits above Inbox
// drawers/panels but below a true blocking modal (70) or toast (80), and
// above the admin-wide Floating Team Hub (floatingPanel, 50) when both are
// open at once on /admin/inbox.
const FLOAT_Z_INDEX = Z_INDEX.inboxFloatingPanel

const RESIZE_HANDLES: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

const HANDLE_CLASSES: Record<ResizeHandle, string> = {
  n: 'top-0 left-2 right-2 h-1.5 cursor-ns-resize',
  s: 'bottom-0 left-2 right-2 h-1.5 cursor-ns-resize',
  e: 'top-2 bottom-2 right-0 w-1.5 cursor-ew-resize',
  w: 'top-2 bottom-2 left-0 w-1.5 cursor-ew-resize',
  ne: 'top-0 right-0 w-3 h-3 cursor-nesw-resize',
  nw: 'top-0 left-0 w-3 h-3 cursor-nwse-resize',
  se: 'bottom-0 right-0 w-3 h-3 cursor-nwse-resize',
  sw: 'bottom-0 left-0 w-3 h-3 cursor-nesw-resize',
}

function ResizeHandleEl({ handle, onResizeBy }: { handle: ResizeHandle; onResizeBy: (h: ResizeHandle, dx: number, dy: number) => void }) {
  const handlers = useResizeHandle((dx, dy) => onResizeBy(handle, dx, dy))
  return (
    <div
      className={`absolute ${HANDLE_CLASSES[handle]}`}
      style={{ touchAction: 'none' }}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerCancel}
      aria-hidden="true"
      data-no-drag
    />
  )
}

export interface FloatWindowChromeProps {
  tabs: FloatTab[]
  activeTabId: string | null
  unreadByTab: Record<string, number>
  geometry: FloatGeometry
  maximized: boolean
  bounds: Bounds
  /** The Inbox conversation currently visible on screen — for the context-mismatch note only, never linkage. */
  viewingClientName: string | null
  isViewingActiveTabsClient: boolean
  onFocusTab: (id: string) => void
  onCloseTab: (id: string) => void
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
  onDragBy: (dx: number, dy: number) => void
  onResizeByHandle: (handle: ResizeHandle, dx: number, dy: number) => void
  onResetPosition: () => void
  onGoToLinkedConversation: (inboxConversationId: number) => void
  /**
   * The body content (per-tab conversation panes) is NOT passed as
   * `children` — it is portaled in from FloatingTeamWorkspace.tsx into
   * whichever DOM node this ref callback reports, so the underlying
   * TabConversationHost components (and their live polls) are never
   * unmounted just because this chrome unmounts (minimize, or a
   * mobile/desktop breakpoint change) — see that file's own header
   * comment for why (unread must keep updating while minimized).
   */
  bodySlotRef: (el: HTMLDivElement | null) => void
}

export function FloatWindowChrome({
  tabs, activeTabId, unreadByTab, geometry, maximized, bounds,
  viewingClientName, isViewingActiveTabsClient,
  onFocusTab, onCloseTab, onMinimize, onToggleMaximize, onClose,
  onDragBy, onResizeByHandle, onResetPosition, onGoToLinkedConversation,
  bodySlotRef,
}: FloatWindowChromeProps) {
  const dragHandlers = useDragHandle(onDragBy)
  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0] ?? null

  // Roving-tabindex tablist keyboard support (WAI-ARIA Tabs pattern, automatic
  // activation): ArrowRight/ArrowLeft move focus to the next/previous tab
  // (wrapping at the ends), Home/End jump to the first/last tab. Moving focus
  // also activates that tab, consistent with a mouse click doing both. Tabs
  // below tabIndex={-1} are otherwise unreachable by Tab key alone, so this
  // handler is the only way a keyboard-only user can reach an inactive tab.
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

  const style = maximized
    ? { left: bounds.left, top: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top }
    : { left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height }

  return (
    <div
      role="region"
      aria-label={activeTab ? `Team Hub floating workspace — linked to ${activeTab.clientName}` : 'Team Hub floating workspace'}
      className="fixed bg-white rounded-xl shadow-2xl border border-walz-border flex flex-col overflow-hidden"
      style={{ ...style, zIndex: FLOAT_Z_INDEX }}
    >
      {/* Drag handle row — pointer handlers are guarded by !maximized: while
          maximized the header still shows (so minimize/maximize/close/reset
          stay reachable) but dragging it must not silently mutate the
          underlying (currently invisible) geometry state, mirroring how the
          resize handles are already hidden entirely while maximized. */}
      <div
        className={`flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-walz-deep-navy text-white select-none ${maximized ? '' : 'cursor-move'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={maximized ? undefined : dragHandlers.onPointerDown}
        onPointerMove={maximized ? undefined : dragHandlers.onPointerMove}
        onPointerUp={maximized ? undefined : dragHandlers.onPointerUp}
        onPointerCancel={maximized ? undefined : dragHandlers.onPointerCancel}
      >
        <p className="text-xs font-bold truncate">Team Hub</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            data-no-drag
            onClick={onResetPosition}
            aria-label="Reset window position and size"
            title="Reset position"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-no-drag
            onClick={onMinimize}
            aria-label="Minimize Team Hub workspace"
            title="Minimize"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-no-drag
            onClick={onToggleMaximize}
            aria-label={maximized ? 'Restore Team Hub workspace' : 'Maximize Team Hub workspace'}
            title={maximized ? 'Restore' : 'Maximize'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            data-no-drag
            onClick={onClose}
            aria-label="Close current Team Hub discussion tab"
            title="Close"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-red-500/70 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs bar */}
      {tabs.length > 0 && (
        <div
          role="tablist"
          aria-label="Open Team Hub discussions"
          className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 bg-walz-off-white border-b border-walz-border overflow-x-auto"
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
                className={`flex-shrink-0 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer ${isActive ? 'bg-walz-navy text-white' : 'bg-white text-walz-navy border border-walz-border hover:bg-walz-navy/5'}`}
                onClick={() => onFocusTab(t.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocusTab(t.id) } }}
              >
                <span className="truncate max-w-[96px]">{t.clientName}</span>
                {unread > 0 && (
                  <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Close ${t.clientName} discussion tab`}
                  onClick={e => { e.stopPropagation(); onCloseTab(t.id) }}
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded ${isActive ? 'hover:bg-white/20' : 'hover:bg-walz-navy/10'}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Linked-client context row */}
      {activeTab && (
        <div className="flex-shrink-0 px-3 py-1.5 bg-walz-gold/10 border-b border-walz-gold/30 text-[11px] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onGoToLinkedConversation(activeTab.inboxConversationId)}
            className="font-semibold text-walz-navy hover:underline truncate"
          >
            Linked to: {activeTab.clientName} · {activeTab.clientRef}
          </button>
          {!isViewingActiveTabsClient && viewingClientName && (
            <span className="text-walz-muted-strong flex-shrink-0 truncate" role="status">
              Currently viewing {viewingClientName}
            </span>
          )}
        </div>
      )}

      {/* Body — content arrives via portal, see bodySlotRef above */}
      <div ref={bodySlotRef} className="flex-1 min-h-0 flex flex-col" />

      {!maximized && RESIZE_HANDLES.map(h => (
        <ResizeHandleEl key={h} handle={h} onResizeBy={onResizeByHandle} />
      ))}
    </div>
  )
}
