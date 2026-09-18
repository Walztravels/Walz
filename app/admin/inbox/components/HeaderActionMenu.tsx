'use client'

// HeaderActionMenu — INBOX UX-2 conversation header ••• menu.
//
// Overflow home for conversation actions. On mobile it's the ONLY action in
// row 1 besides back/identity; on desktop it complements the compact assign +
// status controls. Proper menu semantics: role=menu/menuitem, focus moves to
// the first item on open, ArrowDown/ArrowUp cycle items, Esc closes AND
// returns focus to the trigger, outside click closes, 44px tap targets,
// z from the chrome scale (drawer layer).

import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, User, Link2, CheckCircle2, RotateCcw } from 'lucide-react'
import { Z_INDEX } from '@/lib/admin/chrome'

export interface HeaderActionMenuProps {
  isResolved: boolean
  onResolve: () => void
  onReopen: () => void
  /** Opens the Secure Application Lookup drawer. */
  onOpenLookup?: () => void
  /** Below lg only: opens the client details panel overlay. */
  onOpenClientPanel?: () => void
}

export function HeaderActionMenu({
  isResolved, onResolve, onReopen, onOpenLookup, onOpenClientPanel,
}: HeaderActionMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Keyboard + outside-click semantics while open:
  //  - focus moves to the first menu item on open;
  //  - ArrowDown/ArrowUp cycle through the items;
  //  - Esc closes AND returns focus to the ••• trigger;
  //  - outside click closes.
  useEffect(() => {
    if (!open) return

    const items = () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])

    items()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const list = items()
        if (list.length === 0) return
        const idx = list.indexOf(document.activeElement as HTMLButtonElement)
        const nextIdx = e.key === 'ArrowDown'
          ? (idx + 1) % list.length
          : idx <= 0 ? list.length - 1 : idx - 1
        list[nextIdx]?.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  function run(action?: () => void) {
    setOpen(false)
    // Refocus the ••• trigger BEFORE invoking the action: the menu item
    // unmounts in this same batch, so an overlay the action opens (e.g. the
    // DetailsDrawer) would otherwise capture <body> as its focus-restore
    // target and dump keyboard/SR users at the top of the document on close.
    triggerRef.current?.focus()
    action?.()
  }

  const itemCls = 'w-full flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs text-walz-navy hover:bg-walz-off-white transition-colors text-left'

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Conversation actions"
        title="Conversation actions"
        className="min-w-[44px] min-h-[44px] -m-1.5 flex items-center justify-center rounded-lg text-walz-navy/60 hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full mt-1 w-52 rounded-xl bg-white border border-walz-border shadow-xl overflow-hidden py-1"
          style={{ zIndex: Z_INDEX.drawer }}
        >
          {/* Client details — below lg only; the ClientInfo rail only exists at
              lg+, so md widths need the overlay entry point too */}
          {onOpenClientPanel && (
            <button role="menuitem" onClick={() => run(onOpenClientPanel)} className={`${itemCls} lg:hidden`}>
              <User className="w-3.5 h-3.5 text-walz-muted-strong" /> Client details
            </button>
          )}
          {onOpenLookup && (
            <button role="menuitem" onClick={() => run(onOpenLookup)} className={itemCls}>
              <Link2 className="w-3.5 h-3.5 text-walz-muted-strong" /> Link / View application
            </button>
          )}
          {!isResolved ? (
            <button role="menuitem" onClick={() => run(onResolve)} className={itemCls}>
              <CheckCircle2 className="w-3.5 h-3.5 text-walz-muted-strong" /> Resolve conversation
            </button>
          ) : (
            <button role="menuitem" onClick={() => run(onReopen)} className={itemCls}>
              <RotateCcw className="w-3.5 h-3.5 text-walz-muted-strong" /> Reopen conversation
            </button>
          )}
        </div>
      )}
    </div>
  )
}
