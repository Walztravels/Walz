'use client'

/**
 * Walz Team Hub V1 — a small curated reaction popover (no full emoji
 * library needed per the product spec). Keyboard-navigable: arrow keys move
 * between emoji, Enter/Space selects, Escape closes.
 */
import { useEffect, useRef, useState } from 'react'
import { SmilePlus } from 'lucide-react'

const EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🙏', '👏', '🔥', '✅', '👀', '🚀', '💯', '😅']

export interface ReactionPickerProps {
  onPick: (emoji: string) => void
  /** Icon-only trigger label — this button has no visible text, so it needs one. */
  label?: string
}

export function ReactionPicker({ onPick, label = 'Add reaction' }: ReactionPickerProps) {
  const [open, setOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleGridKeyDown(e: React.KeyboardEvent) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    const buttons = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-emoji-btn]') ?? [])
    if (buttons.length === 0) return
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement)
    e.preventDefault()
    const cols = 7
    let next = idx
    if (e.key === 'ArrowRight') next = Math.min(idx + 1, buttons.length - 1)
    if (e.key === 'ArrowLeft') next = Math.max(idx - 1, 0)
    if (e.key === 'ArrowDown') next = Math.min(idx + cols, buttons.length - 1)
    if (e.key === 'ArrowUp') next = Math.max(idx - cols, 0)
    buttons[next]?.focus()
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
      >
        <SmilePlus className="w-4 h-4" />
      </button>
      {open && (
        <div
          ref={gridRef}
          role="menu"
          aria-label="Reactions"
          onKeyDown={handleGridKeyDown}
          className="absolute z-20 bottom-full mb-1 right-0 grid grid-cols-7 gap-0.5 rounded-xl bg-white border border-walz-border shadow-xl p-1.5"
        >
          {EMOJI.map(emoji => (
            <button
              key={emoji}
              type="button"
              data-emoji-btn
              role="menuitem"
              onClick={() => { onPick(emoji); setOpen(false) }}
              aria-label={`React with ${emoji}`}
              className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg hover:bg-walz-navy/5 text-base focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
