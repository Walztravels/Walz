'use client'

// components/common/SpeakToHuman.tsx
//
// Floating "Speak to Human" control shared by every customer-facing Jade
// chat surface (site widget, portal chat).
//
// ONE CLICK — no category selector, no confirmation step:
//   click → "Connecting you to a team member…" → POST /api/jade/handoff
//   (server infers category from conversation context) → host flips to
//   "Human Support Active".
//
// Guarantees:
//  - Renders ONLY UI. Being visible never sends a message or assigns staff.
//  - Handoff fires only on the explicit click.
//  - When the conversation is human-owned it renders a passive
//    "Human Support Active" pill instead of the button.
//  - Portal (no Chatwoot conversation): labelled "Speak to Human on WhatsApp",
//    opens a prefilled WhatsApp draft the CUSTOMER sends — no fake assignment.

import { useState, useCallback } from 'react'
import { speakToHumanControlState } from '@/lib/jade/human-handoff'

export interface SpeakToHumanProps {
  chatOpen:       boolean
  isHandedOff:    boolean
  conversationId: number | null
  channel?:       string
  customerName?:  string | null
  /** Called after a successful handoff so the host chat can flip to human mode. */
  onHandoffConfirmed: (agentName: string | null) => void
  /**
   * Surfaces with no Chatwoot conversation (e.g. portal chat): the button is
   * labelled "Speak to Human on WhatsApp" and opens a prefilled draft — the
   * CUSTOMER sends it, nothing is sent automatically on their behalf.
   */
  whatsappFallbackE164?: string
  /** Dark-surface styling (portal). */
  dark?: boolean
}

export function SpeakToHuman({
  chatOpen, isHandedOff, conversationId, channel, customerName,
  onHandoffConfirmed, whatsappFallbackE164, dark,
}: SpeakToHumanProps) {
  const [connecting, setConnecting] = useState(false)
  const [hint,       setHint]       = useState<string | null>(null)

  const state = speakToHumanControlState({ chatOpen, isHandedOff })
  const isWhatsAppFallback = !conversationId && !!whatsappFallbackE164

  const handleClick = useCallback(async () => {
    if (connecting) return

    // Portal / no Chatwoot conversation → WhatsApp draft (customer sends it)
    if (isWhatsAppFallback) {
      const text = "Hello, I'd like to speak with a human"
      window.open(`https://wa.me/${whatsappFallbackE164}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
      return
    }

    setConnecting(true)
    setHint(null)
    try {
      const res  = await fetch('/api/jade/handoff', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          conversationId,
          channel:      channel ?? 'website chat',
          customerName: customerName ?? undefined,
        }),
      })
      const data = await res.json() as { ok?: boolean; needsMessage?: boolean; assignedAgentName?: string | null }
      if (data.needsMessage) {
        setHint('Send a quick message first and I’ll connect you right away.')
        return
      }
      if (data.ok) {
        onHandoffConfirmed(data.assignedAgentName ?? null)
        return
      }
      setHint('Something went wrong — please try again.')
    } catch {
      setHint('Something went wrong — please try again.')
    } finally {
      setConnecting(false)
    }
  }, [connecting, conversationId, channel, customerName, onHandoffConfirmed, isWhatsAppFallback, whatsappFallbackE164])

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
    <div className="flex flex-col items-end px-3 pb-1.5 gap-1">
      {hint && (
        <p className={`text-[11px] ${dark ? 'text-amber-300' : 'text-amber-700'}`}>{hint}</p>
      )}
      <button
        onClick={() => void handleClick()}
        disabled={connecting}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm transition-colors disabled:opacity-70 ${
          dark
            ? 'border-[#C9A84C]/40 bg-white/5 text-white/80 hover:bg-[#C9A84C]/15'
            : 'border-[#C9A84C]/40 bg-white/95 text-[#0B1F3A] hover:bg-[#C9A84C]/10'
        }`}
      >
        <span>🧑‍💼</span>
        {connecting
          ? 'Connecting you to a team member…'
          : isWhatsAppFallback
          ? 'Speak to Human on WhatsApp'
          : 'Speak to Human'}
      </button>
    </div>
  )
}
