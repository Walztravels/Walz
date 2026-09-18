'use client'

// DetailsDrawer — INBOX UX-4 shared drawer primitive.
//
// Right-side slide-in below lg for BOTH tablet (md–lg) and mobile — it
// replaces the UX-2 minimal full-screen client overlay; the lg+ ClientInfo
// rail is unchanged. Contract:
//   - chrome z-scale drawer layer (Z_INDEX.drawer);
//   - scrim click + Esc close;
//   - focus moves into the drawer on open and returns to the opener on close;
//   - safe-area bottom padding; the body is its own scroll region;
//   - motion-safe slide transition (reduced-motion users get an instant show).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Z_INDEX } from '@/lib/admin/chrome'

export interface DetailsDrawerProps {
  open: boolean
  onClose: () => void
  /** Dialog accessible name + header title. */
  title: string
  children: ReactNode
}

export function DetailsDrawer({ open, onClose, title, children }: DetailsDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [entered, setEntered] = useState(false)

  // Focus into the drawer on open; slide in on the next frame; on close
  // (or unmount) restore focus to whatever opened it.
  useEffect(() => {
    if (!open) { setEntered(false); return }
    // Never capture <body> as the restore target — a menu that closed itself
    // in the same batch can leave focus there; better to restore nothing.
    restoreRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null
    closeRef.current?.focus()
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => {
      cancelAnimationFrame(raf)
      restoreRef.current?.focus()
    }
  }, [open])

  // Esc closes; Tab is trapped inside the panel — aria-modal promises the
  // background is unreachable, and the chat pane behind the scrim is NOT
  // inert (page-level inert only tracks list/chat screen state).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)
      if (focusables.length === 0) { e.preventDefault(); return }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (active == null || !panel.contains(active)) {
        e.preventDefault(); first.focus(); return
      }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 lg:hidden" style={{ zIndex: Z_INDEX.drawer }}>
      {/* Scrim — click closes */}
      <div className="absolute inset-0 bg-walz-deep-navy/40" onClick={onClose} aria-hidden="true" />

      {/* Panel — full width on phones, right-side sheet from sm up */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-y-0 right-0 w-full sm:max-w-sm bg-white shadow-2xl flex flex-col
          motion-safe:transition-transform motion-safe:duration-200
          ${entered ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-walz-border">
          <p className="text-sm font-bold text-walz-deep-navy">{title}</p>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] -m-1.5 flex items-center justify-center rounded-lg text-walz-navy/60 hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Own scroll region — hosted content (ClientInfo) may also manage
            its own h-full scroller; min-h-0 keeps either behaved. */}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
