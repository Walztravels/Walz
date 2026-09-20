'use client'

/**
 * Walz Team Hub V1 — shared slide-in overlay primitive for ThreadPanel /
 * StaffDirectoryPanel / CreateConversationModal / MemberManagementPanel.
 * Deliberately lighter than app/admin/inbox/components/DetailsDrawer.tsx's
 * full Tab-trap (this is a new, self-contained Team Hub component, not an
 * edit to that Inbox file) but keeps the load-bearing accessibility
 * behaviors: Escape closes, focus moves into the panel on open, and focus
 * returns to whatever opened it on close — so it is always keyboard
 * reachable and dismissable, and never traps focus incorrectly (it doesn't
 * attempt a Tab loop at all, rather than attempt one and get it wrong).
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export interface OverlayProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Right-side slide-in (default) vs a centered dialog (create-conversation modal). */
  variant?: 'side' | 'center'
  widthClassName?: string
  /** Override the content wrapper's classes — default is a simple scroll region; pass a flex-col shape for children (e.g. ThreadPanel) that manage their own internal scrolling. */
  contentClassName?: string
}

export function Overlay({
  open, onClose, title, children, variant = 'side', widthClassName = 'max-w-sm',
  contentClassName = 'flex-1 min-h-0 overflow-y-auto',
}: OverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null
    closeRef.current?.focus()
    return () => { restoreRef.current?.focus() }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isCenter = variant === 'center'

  return (
    <div className="fixed inset-0 z-[65]">
      <div className="absolute inset-0 bg-walz-deep-navy/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          isCenter
            ? `absolute inset-0 flex items-center justify-center p-4`
            : `absolute inset-y-0 right-0 w-full ${widthClassName} bg-white shadow-2xl flex flex-col`
        }
      >
        <div className={isCenter ? `w-full ${widthClassName} bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]` : 'contents'}>
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-walz-border">
            <p className="text-sm font-bold text-walz-deep-navy truncate">{title}</p>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close"
              className="min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center rounded-lg text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className={contentClassName}>{children}</div>
        </div>
      </div>
    </div>
  )
}
