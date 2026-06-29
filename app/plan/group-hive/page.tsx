'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Users, ArrowRight, Loader2, Copy, Check } from 'lucide-react'

export default function GroupHiveCreatePage() {
  const [tripName,    setTripName]    = useState('')
  const [email,       setEmail]       = useState('')
  const [memberCount, setMemberCount] = useState(4)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [created,     setCreated]     = useState<{ slug: string; shareUrl: string; tripName: string } | null>(null)
  const [copied,      setCopied]      = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!tripName.trim() || memberCount < 2) return
    if (!email.trim()) { setError('Please enter your email so we can send you the results'); return }
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/plan/group-hive', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tripName: tripName.trim(), memberCount, email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create group plan')
      setCreated({ slug: data.slug, shareUrl: data.shareUrl, tripName: tripName.trim() })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function copyLink() {
    if (!created) return
    navigator.clipboard.writeText(created.shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A] flex flex-col items-center justify-center px-5 py-20">
      <div
        className="fixed top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent 0%, #C9A84C 30%, #C9A84C 70%, transparent 100%)' }}
      />

      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <p className="text-[#C9A84C] text-[10px] font-bold tracking-[0.28em] uppercase mb-4">
            Group Itinerary Hive
          </p>
          <h1
            className="text-white font-bold leading-tight mb-3"
            style={{ fontSize: 'clamp(2rem, 6vw, 3rem)' }}
          >
            {created ? `${created.tripName} is live 🎉` : 'Plan together.'}
          </h1>
          <p className="text-white/45 text-sm leading-relaxed max-w-xs mx-auto">
            {created
              ? 'Share ONE link with your group. Everyone fills preferences privately. Jade reveals the perfect destination.'
              : "Everyone shares travel preferences privately. Jade finds the destination your whole group will love."}
          </p>
        </div>

        {!created ? (
          <form onSubmit={handleCreate}>
            <div
              className="rounded-2xl p-6 mb-4"
              style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', border: '1px solid rgba(201,168,76,0.25)' }}
            >
              {/* Trip name */}
              <div className="mb-5">
                <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-2.5 text-[#C9A84C]">
                  Give your trip a name
                </label>
                <input
                  type="text"
                  value={tripName}
                  onChange={e => setTripName(e.target.value)}
                  placeholder="Bali 2026, Lagos Squad, Family Summer..."
                  required
                  maxLength={60}
                  className="w-full bg-transparent text-white text-sm outline-none py-2 placeholder-white/20"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}
                  onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(201,168,76,0.65)' }}
                  onBlur={e  => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.15)' }}
                />
              </div>

              {/* Email */}
              <div className="mb-7">
                <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-2.5 text-[#C9A84C]">
                  Your email (we'll send the link)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
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
                    onClick={() => setMemberCount(n => Math.max(2, n - 1))}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold transition-all"
                    style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = '#C9A84C'; (e.currentTarget as HTMLElement).style.color = '#C9A84C' }}
                    onMouseOut={e  => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
                  >−</button>
                  <div className="flex-1 text-center">
                    <span className="text-white font-bold" style={{ fontSize: '2.5rem' }}>{memberCount}</span>
                    <p className="text-white/30 text-[10px] mt-0.5">people</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMemberCount(n => Math.min(20, n + 1))}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold transition-all"
                    style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = '#C9A84C'; (e.currentTarget as HTMLElement).style.color = '#C9A84C' }}
                    onMouseOut={e  => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
                  >+</button>
                </div>
                <div className="flex justify-between gap-2">
                  {[2, 4, 6, 8, 10].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMemberCount(n)}
                      className="flex-1 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={memberCount === n
                        ? { background: '#C9A84C', color: '#0B1F3A' }
                        : { border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }
                      }
                    >{n}</button>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

            <button
              type="submit"
              disabled={loading || !tripName.trim() || memberCount < 2}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#C9A84C', color: '#0B1F3A' }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Creating…</>
              ) : (
                <><Users className="w-4 h-4" />Create Group Plan<ArrowRight className="w-4 h-4" /></>
              )}
            </button>

            <p className="text-white/25 text-[11px] text-center mt-4">
              Everyone opens the same link and fills in their preferences privately.
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Share link */}
            <div
              className="rounded-2xl p-6"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,76,0.25)' }}
            >
              <p className="text-[#C9A84C] text-[10px] font-bold tracking-[0.26em] uppercase mb-3">
                Share this ONE link with everyone
              </p>
              <div
                className="rounded-xl p-4 mb-4 font-mono text-sm text-white/80 break-all"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {created.shareUrl}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={copyLink}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
                  style={{ background: '#C9A84C', color: '#0B1F3A' }}
                >
                  {copied
                    ? <><Check className="w-4 h-4" />Copied!</>
                    : <><Copy className="w-4 h-4" />Copy Link</>}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Hi! We're planning "${created.tripName}" together. Share your travel preferences privately here (takes 2 mins):\n${created.shareUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-green-500 text-white hover:bg-green-600 transition-colors"
                >
                  📱 WhatsApp
                </a>
              </div>
            </div>

            <Link
              href={`/plan/group-hive/${created.slug}`}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white/60 hover:text-white/80 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              View Group Dashboard <ArrowRight className="w-4 h-4" />
            </Link>

            <button
              onClick={() => { setCreated(null); setTripName(''); setMemberCount(4) }}
              className="w-full text-white/25 text-xs hover:text-white/45 transition-colors py-2"
            >
              Create another group plan
            </button>
          </div>
        )}

        {!created && (
          <div className="text-center mt-8">
            <Link href="/plan/library" className="text-white/25 text-xs hover:text-white/45 transition-colors">
              ← Back to My Trips
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
