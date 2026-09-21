'use client'

/**
 * Admin-wide Floating Team Hub — the draggable/resizable window chrome.
 * Header is the ONLY drag handle (useFloatingDrag ignores a pointerdown
 * that lands on a button/link/input inside it); 8 edge/corner handles do
 * resize (useFloatingResize). Both hooks operate purely on the shared
 * FloatingTeamHubContext geometry — this component only renders.
 *
 * z-[50] = Z_INDEX.floatingPanel (lib/admin/chrome.ts) — deliberately below
 * Team Hub's own Overlay.tsx sub-panels (z-[65]) and below any
 * modal/toast, so a security/confirm dialog or a toast is never buried.
 */
import { useRouter } from 'next/navigation'
import { Minus, Square, X, ExternalLink, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useFloatingTeamHub } from './FloatingTeamHubContext'
import { useFloatingDrag } from './useFloatingDrag'
import { useFloatingResize } from './useFloatingResize'
import { maximizedGeometry, type ResizeHandle } from '@/lib/team-hub-floating/geometry'
import { buildFullTeamHubHref } from '@/lib/team-hub-floating/route'
import { FloatingTeamHubContent } from './FloatingTeamHubContent'

const RESIZE_HANDLES: { handle: ResizeHandle; className: string; cursor: string }[] = [
  { handle: 'n', className: 'top-0 left-2 right-2 h-1.5', cursor: 'ns-resize' },
  { handle: 's', className: 'bottom-0 left-2 right-2 h-1.5', cursor: 'ns-resize' },
  { handle: 'e', className: 'right-0 top-2 bottom-2 w-1.5', cursor: 'ew-resize' },
  { handle: 'w', className: 'left-0 top-2 bottom-2 w-1.5', cursor: 'ew-resize' },
  { handle: 'ne', className: 'top-0 right-0 w-3 h-3', cursor: 'nesw-resize' },
  { handle: 'nw', className: 'top-0 left-0 w-3 h-3', cursor: 'nwse-resize' },
  { handle: 'se', className: 'bottom-0 right-0 w-3 h-3', cursor: 'nwse-resize' },
  { handle: 'sw', className: 'bottom-0 left-0 w-3 h-3', cursor: 'nesw-resize' },
]

export interface FloatingTeamHubWindowProps {
  /** Tablet (768–1023px): "a constrained floating window if there's room,
   * otherwise a large sheet/full-screen mode" — this codebase's Admin
   * sidebar takes 240px at that width, so a fixed, non-draggable,
   * non-resizable content-area-filling sheet (touch targets ≥44px, same as
   * the normal header's buttons — the header below uses one
   * `min-w-[44px] min-h-[44px]` control size in EVERY mode, matching the
   * 44px precedent already established elsewhere in Team Hub, e.g.
   * app/admin/team/components/Overlay.tsx's close button) is the reliable
   * choice at every tablet width rather than a room-detection heuristic.
   * Desktop (≥1024px) keeps the full draggable/resizable experience. */
  sheetMode?: boolean
}

export function FloatingTeamHubWindow({ sheetMode = false }: FloatingTeamHubWindowProps) {
  const router = useRouter()
  const {
    geometry, isMaximized, unreadCount, selectedConversationId,
    minimize, close, toggleMaximize, resetPosition, resetSize, getContentAreaBounds,
  } = useFloatingTeamHub()
  const { isDragging, onHeaderPointerDown, onHeaderPointerMove, onHeaderPointerUp, onHeaderPointerCancel } = useFloatingDrag()
  const { resizingHandle, startResize, onPointerMove: onResizePointerMove, onPointerUp: onResizePointerUp, onPointerCancel: onResizePointerCancel } = useFloatingResize()
  const [menuOpen, setMenuOpen] = useState(false)

  const rect = (isMaximized || sheetMode) ? maximizedGeometry(getContentAreaBounds()) : geometry

  function openFullTeamHub() {
    // Deep-link the currently-selected conversation across via the SAME
    // `?c=` convention the full page already parses (lib/deepLink.ts) — the
    // full page independently re-validates membership server-side
    // (GET .../conversations/[id] -> checkConversationMembership), so a
    // stale/invalid carried-over id is never trusted, only ever re-checked.
    const href = buildFullTeamHubHref(selectedConversationId)
    close()
    router.push(href)
  }

  return (
    <div
      role="dialog"
      aria-label="Team Hub"
      className="fixed bg-white rounded-xl shadow-2xl ring-1 ring-black/10 flex flex-col overflow-hidden"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: 50 }}
    >
      {/* Header — the ONLY drag handle (disabled entirely in tablet sheet mode) */}
      <div
        {...(sheetMode ? {} : {
          onPointerDown: onHeaderPointerDown,
          onPointerMove: onHeaderPointerMove,
          onPointerUp: onHeaderPointerUp,
          onPointerCancel: onHeaderPointerCancel,
        })}
        className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-walz-deep-navy text-white select-none ${isMaximized || sheetMode ? '' : 'cursor-grab'} ${isDragging ? 'cursor-grabbing' : ''}`}
        style={{ touchAction: 'none' }}
      >
        <p className="flex-1 text-sm font-bold truncate">
          Team Hub
          {unreadCount > 0 && <span className="ml-2 text-[11px] font-semibold text-amber-300">{unreadCount} new</span>}
        </p>

        <div className="relative" hidden={sheetMode}>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Window settings"
            title="Window settings"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl ring-1 ring-black/10 py-1 z-10 text-walz-deep-navy">
              <button
                role="menuitem"
                type="button"
                onClick={() => { resetPosition(); setMenuOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-walz-navy/5"
              >
                Reset window position
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => { resetSize(); setMenuOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-walz-navy/5"
              >
                Reset window size
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={openFullTeamHub}
          aria-label="Open Full Team Hub"
          title="Open Full Team Hub"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={minimize}
          aria-label="Minimize Team Hub"
          title="Minimize"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        {!sheetMode && (
          <button
            type="button"
            onClick={toggleMaximize}
            aria-label={isMaximized ? 'Restore Team Hub' : 'Maximize Team Hub'}
            title={isMaximized ? 'Restore' : 'Maximize'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Close Team Hub"
          title="Close"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-red-500/80 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        <FloatingTeamHubContent />
      </div>

      {/* Resize handles — hidden while maximized or in tablet sheet mode */}
      {!isMaximized && !sheetMode && RESIZE_HANDLES.map(({ handle, className, cursor }) => (
        <div
          key={handle}
          onPointerDown={startResize(handle)}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerCancel}
          role="presentation"
          aria-hidden="true"
          className={`absolute ${className} ${resizingHandle === handle ? 'bg-walz-navy/20' : ''}`}
          style={{ cursor, touchAction: 'none' }}
        />
      ))}
    </div>
  )
}
