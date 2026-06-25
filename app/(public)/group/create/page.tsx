'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { ArrowRight, Copy, Check, Users, Loader2 } from 'lucide-react'

interface InviteLink {
  name:  string
  token: string
  url:   string
}

interface CreateResult {
  sessionId:   string
  sessionName: string
  inviteLinks: InviteLink[]
}

export default function GroupCreatePage() {
  const searchParams = useSearchParams()
  const { status }   = useSession()
  const autoSubmitted = useRef(false)

  const [tripName,   setTripName]   = useState(searchParams.get('name') ?? '')
  const [travellers, setTravellers] = useState<number>(
    Math.min(20, Math.max(2, Number(searchParams.get('count') ?? 4))),
  )
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [result,     setResult]     = useState<CreateResult | null>(null)
  const [copied,     setCopied]     = useState<string | null>(null)

  // Auto-submit when user returns from login with pre-filled name+count in URL
  useEffect(() => {
    if (
      status === 'authenticated' &&
      !autoSubmitted.current &&
      tripName.trim() &&
      travellers >= 2 &&
      !result &&
      !loading &&
      searchParams.get('name')
    ) {
      autoSubmitted.current = true
      handleSubmit({ preventDefault: () => {} } as React.FormEvent)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tripName.trim() || travellers < 2) return
    setLoading(true)
    setError(null)

    try {
      const members = Array.from({ length: travellers }, (_, i) => ({ name: `Person ${i + 1}` }))
      const res = await fetch('/api/public/group/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: tripName.trim(), members }),
      })

      if (res.status === 401) {
        const callback = `/group/create?name=${encodeURIComponent(tripName)}&count=${travellers}`
        window.location.href = `/login?callbackUrl=${encodeURIComponent(callback)}`
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(data.error ?? 'Failed to create trip. Please try again.')
        return
      }

      setResult(await res.json() as CreateResult)
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function copyAll() {
    if (!result) return
    const text = result.inviteLinks
      .map((l, i) => `${l.name || `Person ${i + 1}`}: ${l.url}`)
      .join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied('all')
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-20"
      style={{ background: '#0B1F3A' }}
    >
      {/* Gold accent line */}
      <div
        className="fixed top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, #C9A84C 30%, #C9A84C 70%, transparent 100%)',
        }}
      />

      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-[#C9A84C] text-[10px] font-bold tracking-[0.28em] uppercase mb-4">
            Group Itinerary Hive
          </p>
          <h1
            className="text-white font-bold leading-tight mb-3"
            style={{ fontSize: 'clamp(2rem, 6vw, 3rem)' }}
          >
            {result ? `${result.sessionName} is live 🎉` : 'Plan together.'}
          </h1>
          <p className="text-white/45 text-sm leading-relaxed max-w-xs mx-auto">
            {result
              ? 'Share each private link. Preferences stay secret until Jade reveals the perfect trip.'
              : "Everyone shares travel preferences privately. Jade finds the destinations your whole group will love."}
          </p>
        </div>

        {!result ? (
          /* ── Create form ──────────────────────────────────────────────── */
          <form onSubmit={handleSubmit}>
            <div
              className="rounded-2xl p-6 mb-4"
              style={{
                background:     'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(12px)',
                border:         '1px solid rgba(201,168,76,0.25)',
              }}
            >
              {/* Trip name */}
              <div className="mb-7">
                <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-2.5 text-[#C9A84C]">
                  Give your trip a name
                </label>
                <input
                  type="text"
                  value={tripName}
                  onChange={e => setTripName(e.target.value)}
                  placeholder="Lagos Squad 2026, Family Summer Escape…"
                  required
                  maxLength={60}
                  className="w-full bg-transparent text-white text-sm outline-none py-2 placeholder-white/20"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}
                  onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(201,168,76,0.65)' }}
                  onBlur={e  => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.15)' }}
                />
              </div>

              {/* Traveller count */}
              <div>
                <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-3 text-[#C9A84C]">
                  How many travellers?
                </label>

                <div className="flex items-center gap-4 mb-4">
                  <button
                    type="button"
                    onClick={() => setTravellers(n => Math.max(2, n - 1))}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold transition-all"
                    style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = '#C9A84C'; (e.currentTarget as HTMLElement).style.color = '#C9A84C' }}
                    onMouseOut={e  => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
                  >
                    −
                  </button>
                  <div className="flex-1 text-center">
                    <span className="text-white font-bold" style={{ fontSize: '2.5rem' }}>{travellers}</span>
                    <p className="text-white/30 text-[10px] mt-0.5">people</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTravellers(n => Math.min(20, n + 1))}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold transition-all"
                    style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = '#C9A84C'; (e.currentTarget as HTMLElement).style.color = '#C9A84C' }}
                    onMouseOut={e  => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
                  >
                    +
                  </button>
                </div>

                {/* Quick-pick presets */}
                <div className="flex justify-between gap-2">
                  {[2, 4, 6, 8, 10].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTravellers(n)}
                      className="flex-1 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={
                        travellers === n
                          ? { background: '#C9A84C', color: '#0B1F3A' }
                          : { border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center mb-4">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !tripName.trim() || travellers < 2}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#C9A84C', color: '#0B1F3A' }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating trip…
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  Create Group Plan
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-white/25 text-[11px] text-center mt-4">
              Each traveller gets a private link. Preferences stay secret until Jade reveals the results.
            </p>
          </form>
        ) : (
          /* ── Invite links ──────────────────────────────────────────────── */
          <div>
            <div
              className="rounded-2xl overflow-hidden mb-4"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border:     '1px solid rgba(201,168,76,0.25)',
              }}
            >
              {/* Header bar */}
              <div
                className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full bg-[#C9A84C] animate-pulse"
                    style={{ animationDuration: '2s' }}
                  />
                  <span className="text-white/50 text-xs">
                    {result.inviteLinks.length} private links ready
                  </span>
                </div>
                <button
                  onClick={copyAll}
                  className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide transition-colors"
                  style={{ color: '#C9A84C' }}
                >
                  {copied === 'all'
                    ? <Check className="w-3 h-3" />
                    : <Copy className="w-3 h-3" />}
                  Copy all
                </button>
              </div>

              {/* Link rows */}
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {result.inviteLinks.map((link, i) => (
                  <div key={link.token} className="flex items-center gap-3 px-5 py-3.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                      style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C' }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/65 text-[11px] font-medium mb-0.5">
                        {link.name || `Person ${i + 1}`}
                      </p>
                      <p className="text-white/28 text-[11px] truncate">{link.url}</p>
                    </div>
                    <button
                      onClick={() => copyLink(link.url)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 transition-all"
                      style={{
                        background: copied === link.url ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)',
                        border:     '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {copied === link.url
                        ? <Check className="w-3 h-3 text-[#C9A84C]" />
                        : <Copy  className="w-3 h-3 text-white/40"  />}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                href={`/group/${result.sessionId}/itinerary`}
                className="flex-1 py-3.5 rounded-xl text-center font-bold text-sm transition-all"
                style={{ background: '#C9A84C', color: '#0B1F3A' }}
              >
                View Trip Dashboard
              </Link>
              <button
                onClick={() => { setResult(null); setTripName(''); setTravellers(4); setError(null) }}
                className="px-5 py-3.5 rounded-xl font-semibold text-sm transition-all text-white/45"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border:     '1px solid rgba(255,255,255,0.1)',
                }}
              >
                New trip
              </button>
            </div>

            <p className="text-white/25 text-[11px] text-center mt-4">
              Jade will notify you when everyone has submitted their preferences.
            </p>
          </div>
        )}

        {/* Back link */}
        {!result && (
          <div className="text-center mt-8">
            <Link href="/" className="text-white/25 text-xs hover:text-white/45 transition-colors">
              ← Back to home
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
