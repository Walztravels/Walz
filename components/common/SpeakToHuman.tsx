'use client'

// components/common/SpeakToHuman.tsx
//
// Floating "Speak to a Human" control shared by every customer-facing Jade
// chat surface (site widget, portal chat).
//
// Guarantees:
//  - Renders ONLY UI. Being visible never sends a message or assigns staff.
//  - Handoff fires only on an explicit category selection (POST /api/jade/handoff).
//  - Cancelling/closing the selector performs no request — Jade stays owner.
//  - When the conversation is human-owned it renders a passive
//    "Human Support Active" pill instead of the button.

import { useState, useCallback } from 'react'
import {
  HANDOFF_CATEGORIES,
  speakToHumanControlState,
  type HandoffCategory,
} from '@/lib/jade/human-handoff'

const CATEGORY_ICONS: Record<HandoffCategory, string> = {
  booking_support: '✈️',
  visa_support:    '🛂',
  payment_issue:   '💳',
  complaint:       '⚠️',
  partnership:     '🤝',
  other:           '💬',
}

export interface SpeakToHumanProps {
  chatOpen:       boolean
  isHandedOff:    boolean
  conversationId: number | null
  channel?:       string
  /** Called after a successful handoff so the host chat can flip to human mode. */
  onHandoffConfirmed: (agentName: string | null, categoryLabel: string) => void
  /**
   * Surfaces with no Chatwoot conversation (e.g. portal chat): on selection,
   * open WhatsApp with a prefilled message instead — the CUSTOMER sends it,
   * so nothing is sent automatically on their behalf.
   */
  whatsappFallbackE164?: string
  /** Dark-surface styling (portal). */
  dark?: boolean
}

export function SpeakToHuman({ chatOpen, isHandedOff, conversationId, channel, onHandoffConfirmed, whatsappFallbackE164, dark }: SpeakToHumanProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [busyKey,  setBusyKey]  = useState<HandoffCategory | null>(null)
  const [hint,     setHint]     = useState<string | null>(null)

  const state = speakToHumanControlState({ chatOpen, isHandedOff })

  const selectCategory = useCallback(async (key: HandoffCategory, label: string) => {
    if (busyKey) return

    // No Chatwoot conversation on this surface → WhatsApp fallback: prefill a
    // message and let the CUSTOMER send it themselves. Nothing auto-sent.
    if (!conversationId && whatsappFallbackE164) {
      const text = `Hello, I'd like to speak with a human — ${label}`
      window.open(`https://wa.me/${whatsappFallbackE164}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
      setMenuOpen(false)
      return
    }

    setBusyKey(key)
    setHint(null)
    try {
      const res  = await fetch('/api/jade/handoff', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ conversationId, category: key, channel: channel ?? 'website chat' }),
      })
      const data = await res.json() as { ok?: boolean; needsMessage?: boolean; assignedAgentName?: string | null }
      if (data.needsMessage) {
        setHint('Send a quick message first and I’ll connect you right away.')
        return
      }
      if (data.ok) {
        setMenuOpen(false)
        onHandoffConfirmed(data.assignedAgentName ?? null, label)
        return
      }
      setHint('Something went wrong — please try again.')
    } catch {
      setHint('Something went wrong — please try again.')
    } finally {
      setBusyKey(null)
    }
  }, [busyKey, conversationId, channel, onHandoffConfirmed, whatsappFallbackE164])

  if (state === 'hidden') return null

  if (state === 'human_active') {
    return (
      <div className="flex justify-end px-3 pb-1.5">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold border ${
          dark
            ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Human Support Active
        </span>
      </div>
    )
  }

  return (
    <div className="relative flex justify-end px-3 pb-1.5">
      {menuOpen && (
        <div className="absolute bottom-full right-3 mb-2 w-60 rounded-2xl border border-[#C9A84C]/30 bg-white shadow-xl overflow-hidden z-20">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#0B1F3A]">
            <p className="text-[12px] font-bold text-[#C9A84C]">How can we help?</p>
            <button
              onClick={() => { setMenuOpen(false); setHint(null) }}
              aria-label="Close"
              className="text-white/60 hover:text-white text-sm leading-none"
            >
              ✕
            </button>
          </div>
          <div className="py-1">
            {HANDOFF_CATEGORIES.map(c => (
              <button
                key={c.key}
                onClick={() => void selectCategory(c.key, c.label)}
                disabled={busyKey !== null}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[#0B1F3A] hover:bg-[#C9A84C]/10 disabled:opacity-50"
              >
                <span className="text-sm">{CATEGORY_ICONS[c.key]}</span>
                <span className="font-medium">{c.label}</span>
                {busyKey === c.key && <span className="ml-auto text-[11px] text-[#C9A84C]">Connecting…</span>}
              </button>
            ))}
          </div>
          {hint && (
            <p className="px-4 pb-3 text-[11px] text-amber-700">{hint}</p>
          )}
        </div>
      )}
      <button
        onClick={() => { setMenuOpen(o => !o); setHint(null) }}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm transition-colors ${
          dark
            ? 'border-[#C9A84C]/40 bg-white/5 text-white/80 hover:bg-[#C9A84C]/15'
            : 'border-[#C9A84C]/40 bg-white/95 text-[#0B1F3A] hover:bg-[#C9A84C]/10'
        }`}
      >
        <span>🧑‍💼</span>
        Speak to a Human
      </button>
    </div>
  )
}
