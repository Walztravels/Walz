'use client'

/**
 * Admin-wide Floating Team Hub — the compact "Team Hub · 3 new" bar shown
 * while minimized. Unread comes from the SAME shared poller the normal
 * window's header and the sidebar badge use (hooks/useTeamHubUnreadCount.ts)
 * — never from localStorage, and it does NOT auto-reopen the window when a
 * new message arrives (no effect here reacts to `unreadCount` by calling
 * openOrRestore()) — the bar just repaints its own badge text.
 *
 * Positioned at a fixed corner of the Admin content area rather than the
 * window's last (x,y) — a minimized bar is a different, much smaller
 * object than the window it collapsed from, so anchoring it to the last
 * normal-window position could put a barely-draggable sliver of it
 * off-screen after a resize. It is still draggable (a small header-less
 * drag surface) per "stays visible, draggable if practical" — dragging it
 * uses its OWN real ~200x44 footprint to clamp the position (not the full
 * window's geometry — see useFloatingDrag's `clampSize` option), and stays
 * draggable even when the underlying window's `isMaximized` flag is true
 * (minimizing preserves that flag so restoring returns to the same state;
 * it says nothing about whether this distinct, always-potentially-
 * draggable bar should be draggable — see useFloatingDrag.ts's file header).
 */
import { useFloatingTeamHub } from './FloatingTeamHubContext'
import { useFloatingDrag } from './useFloatingDrag'
import { formatMinimizedLabel } from '@/lib/team-hub-floating/route'
import { MessageSquareText, X } from 'lucide-react'

// The bar's own real on-screen footprint — deliberately much smaller than
// the normal window it collapsed from (see file header). Shared between the
// drag clamp below and the render-time position clamp.
const BAR_WIDTH = 200
const BAR_HEIGHT = 44

export function FloatingTeamHubMinimizedBar() {
  const { unreadCount, openOrRestore, close, geometry, getContentAreaBounds } = useFloatingTeamHub()
  const { isDragging, onHeaderPointerDown, onHeaderPointerMove, onHeaderPointerUp, onHeaderPointerCancel } = useFloatingDrag({
    clampSize: { width: BAR_WIDTH, height: BAR_HEIGHT },
    ignoreMaximizedGuard: true,
  })

  const bounds = getContentAreaBounds()
  // Clamp the bar's own small footprint into bounds using the window's last
  // x — height is fixed/small so this only needs an x/y clamp, not a resize.
  const barWidth = BAR_WIDTH
  const barHeight = BAR_HEIGHT
  const x = Math.min(Math.max(geometry.x, bounds.left), Math.max(bounds.left, bounds.right - barWidth))
  const y = Math.min(Math.max(geometry.y, bounds.top), Math.max(bounds.top, bounds.bottom - barHeight))

  return (
    <div
      onPointerDown={onHeaderPointerDown}
      onPointerMove={onHeaderPointerMove}
      onPointerUp={onHeaderPointerUp}
      onPointerCancel={onHeaderPointerCancel}
      role="button"
      tabIndex={0}
      onClick={openOrRestore}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOrRestore() } }}
      aria-label={`Restore Team Hub${unreadCount > 0 ? `, ${unreadCount} new messages` : ''}`}
      className={`fixed flex items-center gap-2 px-3 py-2.5 rounded-full bg-walz-deep-navy text-white shadow-2xl ring-1 ring-black/10 select-none cursor-pointer ${isDragging ? 'cursor-grabbing' : ''}`}
      style={{ left: x, top: y, width: barWidth, height: barHeight, zIndex: 50, touchAction: 'none' }}
    >
      <MessageSquareText className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 text-xs font-semibold truncate">
        {formatMinimizedLabel(unreadCount)}
      </span>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); close() }}
        aria-label="Close Team Hub"
        title="Close"
        className="min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
