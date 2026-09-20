'use client'

/**
 * Walz Team Hub V1 — the composer's Jade writing-assist menu. A NEW,
 * self-contained Team Hub component (mirrors the visual spirit of
 * app/admin/inbox/components/ReplyBox.tsx's own Jade button for
 * familiarity — it does not import from or modify that file). Tier 1 acts
 * on the staff member's own current draft (fix_writing / make_professional
 * / make_friendlier / shorten) and REPLACES it; Tier 2 (summarize_thread —
 * only offered when a parentMessageId/thread context exists —
 * summarize_conversation, extract_action_items) reads server-side context
 * and drops its result into the draft for review before sending. Gold is
 * the AI-accent color here (the sparkle + this whole menu is Jade-branded);
 * the Send button itself stays blue-600 elsewhere in Composer.tsx.
 */
import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { teamFetch, extractErrorMessage } from '../lib/teamFetch'

type JadeOperation =
  | 'fix_writing' | 'make_professional' | 'make_friendlier' | 'shorten'
  | 'summarize_thread' | 'summarize_conversation' | 'extract_action_items'

const TIER1: { op: JadeOperation; label: string }[] = [
  { op: 'fix_writing', label: 'Fix writing' },
  { op: 'make_professional', label: 'Make professional' },
  { op: 'make_friendlier', label: 'Make friendlier' },
  { op: 'shorten', label: 'Shorten' },
]
const TIER2: { op: JadeOperation; label: string }[] = [
  { op: 'summarize_conversation', label: 'Summarize conversation' },
  { op: 'extract_action_items', label: 'Extract action items' },
]

function isTier1(op: JadeOperation): boolean {
  return op === 'fix_writing' || op === 'make_professional' || op === 'make_friendlier' || op === 'shorten'
}

export interface JadeComposerMenuProps {
  conversationId: string
  getDraft: () => string
  onReplace: (text: string) => void
  /** Present only when composing inside an open thread — enables "Summarize this thread". */
  parentMessageId?: string | null
  disabled?: boolean
}

export function JadeComposerMenu({ conversationId, getDraft, onReplace, parentMessageId, disabled }: JadeComposerMenuProps) {
  const [open, setOpen] = useState(false)
  const [busyOp, setBusyOp] = useState<JadeOperation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function run(op: JadeOperation) {
    setError(null)
    if (isTier1(op) && !getDraft().trim()) { setError('Type a draft first.'); return }
    setBusyOp(op)
    try {
      const body = isTier1(op)
        ? { operation: op, text: getDraft() }
        : op === 'summarize_thread'
          ? { operation: op, parentMessageId }
          : { operation: op }
      const res = await teamFetch(`/api/admin/team/conversations/${conversationId}/jade-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { setError(await extractErrorMessage(res, 'Jade could not complete that request.')); return }
      const data = (await res.json()) as { suggestion: string }
      onReplace(data.suggestion)
      setOpen(false)
    } catch {
      setError('Jade could not complete that request.')
    } finally {
      setBusyOp(null)
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Write with Jade"
        title="Write with Jade"
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5 transition-colors disabled:opacity-40"
      >
        <Sparkles className="w-3.5 h-3.5 text-walz-gold" /> Jade
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Jade writing assist"
          className="absolute z-20 bottom-full mb-1 left-0 w-56 rounded-xl bg-white border border-walz-border shadow-xl p-1.5 space-y-0.5"
        >
          <p className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-walz-muted-strong font-semibold">Your draft</p>
          {TIER1.map(({ op, label }) => (
            <button
              key={op} role="menuitem" onClick={() => void run(op)} disabled={busyOp !== null}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-walz-navy hover:bg-walz-off-white disabled:opacity-50"
            >
              {label} {busyOp === op && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
          ))}
          <div className="h-px bg-walz-border my-1" />
          <p className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-walz-muted-strong font-semibold">This conversation</p>
          {parentMessageId && (
            <button
              role="menuitem" onClick={() => void run('summarize_thread')} disabled={busyOp !== null}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-walz-navy hover:bg-walz-off-white disabled:opacity-50"
            >
              Summarize this thread {busyOp === 'summarize_thread' && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
          )}
          {TIER2.map(({ op, label }) => (
            <button
              key={op} role="menuitem" onClick={() => void run(op)} disabled={busyOp !== null}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-walz-navy hover:bg-walz-off-white disabled:opacity-50"
            >
              {label} {busyOp === op && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
          ))}
          {error && <p className="px-2 pt-1 text-[11px] text-walz-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
