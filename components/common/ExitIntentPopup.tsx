'use client'
import { useState, useEffect, useCallback } from 'react'
import { X, Gift, ChevronDown } from 'lucide-react'

const DESTINATIONS = ['UK', 'Canada', 'Schengen', 'UAE', 'USA', 'Australia']
const STORAGE_KEY  = 'walz_exit_popup_dismissed'
const COOLDOWN_MS  = 30 * 24 * 60 * 60 * 1000 // 30 days

export function ExitIntentPopup() {
  const [show,   setShow]   = useState(false)
  const [email,  setEmail]  = useState('')
  const [dest,   setDest]   = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const dismiss = useCallback(() => {
    setShow(false)
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* private */ }
  }, [])

  useEffect(() => {
    try {
      const last = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0')
      if (Date.now() - last < COOLDOWN_MS) return
    } catch { return }

    if (window.location.pathname.startsWith('/admin')) return

    let triggered = false

    const handleMouseLeave = (e: MouseEvent) => {
      if (triggered) return
      if (e.clientY <= 0 && e.relatedTarget === null) {
        triggered = true
        setTimeout(() => setShow(true), 300)
      }
    }

    let lastScrollY = window.scrollY
    const handleScroll = () => {
      const currentY = window.scrollY
      if (!triggered && lastScrollY > 300 && currentY < 50) {
        triggered = true
        setTimeout(() => setShow(true), 400)
      }
      lastScrollY = currentY
    }

    document.addEventListener('mouseleave', handleMouseLeave)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setStatus('loading')
    try {
      await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: `exit-intent-${dest || 'general'}` }),
      })
      setStatus('done')
      setTimeout(dismiss, 3000)
    } catch {
      setStatus('error')
    }
  }

  if (!show) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-popup-title"
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      >
        <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
          <div className="bg-[#C9A84C] px-8 pt-8 pb-6 text-center">
            <div className="w-14 h-14 bg-[#0B1F3A] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Gift className="w-7 h-7 text-[#C9A84C]" />
            </div>
            <h2 id="exit-popup-title" className="text-xl font-display font-bold text-[#0B1F3A] leading-tight">
              Before You Go —<br />Get Your Free Visa Checklist
            </h2>
          </div>

          <div className="px-8 py-6">
            {status === 'done' ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">🎉</div>
                <p className="font-bold text-[#0B1F3A] text-lg">Sent!</p>
                <p className="text-[#0B1F3A]/60 text-sm mt-1">
                  Check your inbox for your personalised visa checklist.
                </p>
              </div>
            ) : (
              <>
                <p className="text-[#0B1F3A]/70 text-sm text-center mb-5 leading-relaxed">
                  Enter your email and destination to receive a <strong>personalised document checklist</strong> — exactly what the embassy needs to approve your application.
                </p>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full h-12 px-4 border border-[#E2D9CC] rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/20"
                  />
                  <div className="relative">
                    <select
                      value={dest}
                      onChange={e => setDest(e.target.value)}
                      className="w-full h-12 pl-4 pr-10 border border-[#E2D9CC] rounded-xl text-sm outline-none focus:border-[#C9A84C] appearance-none bg-white text-[#0B1F3A]"
                    >
                      <option value="">Select destination (optional)</option>
                      {DESTINATIONS.map(d => (
                        <option key={d} value={d}>{d} Visa</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0B1F3A]/40 pointer-events-none" />
                  </div>
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full h-12 bg-[#0B1F3A] hover:bg-[#162d52] text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-60"
                  >
                    {status === 'loading' ? 'Sending…' : 'Send My Free Checklist →'}
                  </button>
                </form>
                {status === 'error' && (
                  <p className="text-red-500 text-xs text-center mt-2">
                    Something went wrong. Try again or WhatsApp us directly.
                  </p>
                )}
                <p className="text-xs text-[#0B1F3A]/30 text-center mt-4">No spam. Unsubscribe anytime.</p>
              </>
            )}
          </div>

          <button
            onClick={dismiss}
            aria-label="Close popup"
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#0B1F3A]/10 hover:bg-[#0B1F3A]/20 transition-colors"
          >
            <X className="w-4 h-4 text-[#0B1F3A]" />
          </button>
        </div>
      </div>
    </>
  )
}
