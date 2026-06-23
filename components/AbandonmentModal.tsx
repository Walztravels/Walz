'use client'

import { useState } from 'react'
import { X, Mail, Plane, FileText, Loader2 } from 'lucide-react'
import type { AbandonmentType } from '@/hooks/useAbandonmentCapture'

interface Props {
  type:      AbandonmentType
  data?:     Record<string, string | number | undefined | null>
  onCapture: (email: string, name?: string) => Promise<void>
  onClose:   () => void
}

const COPY: Record<AbandonmentType, { icon: typeof Plane; headline: string; subline: string; cta: string }> = {
  flight_search: {
    icon:     Plane,
    headline: "Don't lose your flight search!",
    subline:  "Leave your email and we'll send you the best fares for this route — and alert you if prices drop.",
    cta:      "Save My Search",
  },
  visa_application: {
    icon:     FileText,
    headline: "Complete your visa application",
    subline:  "Leave your email and we'll send you a reminder to finish — and answer any questions you have.",
    cta:      "Send Me a Reminder",
  },
  booking_checkout: {
    icon:     Plane,
    headline: "Your booking is almost complete!",
    subline:  "Enter your email and we'll hold your details so you can pick up exactly where you left off.",
    cta:      "Save My Booking",
  },
}

export function AbandonmentModal({ type, data, onCapture, onClose }: Props) {
  const [email,     setEmail]     = useState('')
  const [name,      setName]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const copy = COPY[type]
  const Icon = copy.icon

  async function handleSubmit() {
    if (!email.trim()) return
    setLoading(true)
    await onCapture(email.trim(), name.trim() || undefined)
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog" aria-modal="true">
      <div className="bg-[#0B1F3A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
        <button onClick={onClose} aria-label="Close"
          className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors">
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <>
            <div className="w-12 h-12 rounded-xl bg-[#C9A84C]/15 border border-[#C9A84C]/25 flex items-center justify-center mb-4">
              <Icon className="w-5 h-5 text-[#C9A84C]" strokeWidth={1.5} />
            </div>

            <h2 className="text-white font-bold text-lg mb-2">{copy.headline}</h2>
            <p className="text-white/50 text-sm leading-relaxed mb-5">{copy.subline}</p>

            {/* Context pill */}
            {data?.origin && data?.destination && (
              <div className="bg-white/5 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
                <Plane className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" strokeWidth={1.5} />
                <span className="text-white/70 text-sm">
                  {data.origin} → {data.destination}
                  {data.date ? ` · ${data.date}` : ''}
                </span>
              </div>
            )}
            {data?.destination && !data?.origin && (
              <div className="bg-white/5 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
                <FileText className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" strokeWidth={1.5} />
                <span className="text-white/70 text-sm">Visa for {String(data.destination)}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  First Name
                </label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Optional"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#C9A84C]/50 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="your@email.com"
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#C9A84C]/50 transition-colors"
                />
              </div>
              <button onClick={handleSubmit} disabled={!email.trim() || loading}
                className="w-full bg-[#C9A84C] hover:bg-[#E8C87A] disabled:opacity-30 text-[#0B1F3A] font-bold text-sm rounded-xl py-3 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {copy.cta}
              </button>
              <p className="text-white/25 text-xs text-center">No spam. One follow-up email only.</p>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-6 h-6 text-green-400" strokeWidth={1.5} />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Check your inbox!</h3>
            <p className="text-white/50 text-sm">We've saved your details and will follow up shortly.</p>
            <button onClick={onClose} className="mt-6 text-[#C9A84C] text-sm hover:text-[#E8C87A] transition-colors">
              Continue browsing →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
