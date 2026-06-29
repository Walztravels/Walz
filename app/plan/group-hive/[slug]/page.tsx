'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

type SessionInfo = {
  id:              string
  tripName:        string
  destination:     string | null
  memberCount:     number
  submittedCount:  number
  isComplete:      boolean
  status:          string
  analysisReady:   boolean
  analysisResult:  AnalysisResult | null
}

type AnalysisResult = {
  groupSummary: string
  destinations: {
    rank:          number
    name:          string
    emoji:         string
    whyItWorks:    string
    bestTime:      string
    budgetRange:   string
    highlight:     string
    perTraveller:  { name: string; theyWillLove: string }[]
    walzCanArrange: string[]
  }[]
  jadeTip: string
}

type FormState = {
  name:         string
  destinations: string
  travelStyle:  string
  budget:       string
  mustHaves:    string
  dates:        string
  specialNeeds: string
}

const EMPTY: FormState = {
  name: '', destinations: '', travelStyle: '',
  budget: '', mustHaves: '', dates: '', specialNeeds: '',
}

const TRAVEL_STYLES = ['Adventure', 'Relaxation', 'Culture', 'Food & Drink', 'Luxury', 'Budget']
const BUDGETS       = ['Under £500', '£500–£1,000', '£1,000–£2,000', '£2,000–£5,000', '£5,000+', 'Flexible']

export default function GroupHiveSlugPage() {
  const { slug } = useParams<{ slug: string }>()

  const [info,         setInfo]         = useState<SessionInfo | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [notFound,     setNotFound]     = useState(false)
  const [form,         setForm]         = useState<FormState>(EMPTY)
  const [submitting,   setSubmitting]   = useState(false)
  const [submitted,    setSubmitted]    = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [analysing,    setAnalysing]    = useState(false)
  const [analyseError, setAnalyseError] = useState<string | null>(null)

  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/plan/group-hive/${slug}`)
      if (res.status === 404) { setNotFound(true); return }
      setInfo(await res.json() as SessionInfo)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    if (localStorage.getItem(`ihive_${slug}`)) setSubmitted(true)
    fetchInfo()
  }, [slug, fetchInfo])

  // Refresh every 30s after submitting to catch when others submit + analysis completes
  useEffect(() => {
    if (!submitted) return
    const interval = setInterval(fetchInfo, 30000)
    return () => clearInterval(interval)
  }, [submitted, fetchInfo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res  = await fetch(`/api/plan/group-hive/${slug}/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Submission failed'); return }
      localStorage.setItem(`ihive_${slug}`, '1')
      setSubmitted(true)
      await fetchInfo()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAnalyse() {
    setAnalysing(true)
    setAnalyseError(null)
    try {
      const res  = await fetch(`/api/plan/group-hive/${slug}/analyse`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setAnalyseError(data.error ?? 'Analysis failed'); return }
      await fetchInfo()
    } catch {
      setAnalyseError('Network error. Please try again.')
    } finally {
      setAnalysing(false)
    }
  }

  const set = (field: keyof FormState, value: string) =>
    setForm(f => ({ ...f, [field]: value }))

  if (loading) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-4xl mb-4">🔍</p>
        <h1 className="text-xl font-bold text-white mb-2">Group plan not found</h1>
        <p className="text-white/40 text-sm mb-6">This link may have expired. Contact whoever shared it with you.</p>
        <Link href="/plan/group-hive" className="text-[#C9A84C] text-sm hover:underline">
          Create a new group plan →
        </Link>
      </div>
    </div>
  )

  const percent   = info ? Math.round((info.submittedCount / info.memberCount) * 100) : 0
  const remaining = info ? info.memberCount - info.submittedCount : 0
  const allIn     = info ? info.submittedCount >= info.memberCount : false

  // ── RESULTS ──────────────────────────────────────────────────────────────
  if (info?.analysisReady && info.analysisResult) {
    const { destinations, groupSummary, jadeTip } = info.analysisResult
    return (
      <div className="min-h-screen bg-[#0B1F3A] py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[#C9A84C] text-[10px] font-bold tracking-[0.28em] uppercase mb-3">
              Group Itinerary Hive
            </p>
            <h1 className="text-white font-bold text-3xl mb-3">🐝 {info.tripName}</h1>
            <p className="text-white/50 text-sm max-w-md mx-auto">{groupSummary}</p>
          </div>

          <div className="space-y-4 mb-8">
            {destinations.map((d, i) => (
              <div
                key={i}
                className="rounded-2xl p-6"
                style={{
                  background: i === 0 ? 'rgba(201,168,76,0.10)' : 'rgba(255,255,255,0.04)',
                  border:     `1px solid ${i === 0 ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-3xl">{d.emoji}</span>
                  <div>
                    <p className="text-[10px] font-bold text-[#C9A84C] tracking-wider uppercase">
                      #{d.rank}{i === 0 ? ' — Top Pick' : ''}
                    </p>
                    <h2 className="text-white font-bold text-lg">{d.name}</h2>
                  </div>
                </div>

                <p className="text-white/60 text-sm mb-4">{d.whyItWorks}</p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <p className="text-white/35 mb-1">Best time</p>
                    <p className="text-white/75 font-medium">{d.bestTime}</p>
                  </div>
                  <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <p className="text-white/35 mb-1">Budget range</p>
                    <p className="text-white/75 font-medium">{d.budgetRange}</p>
                  </div>
                </div>

                {d.perTraveller.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-2">
                      Why each person will love it
                    </p>
                    <div className="space-y-1.5">
                      {d.perTraveller.map((pt, j) => (
                        <div key={j} className="flex gap-2 text-xs">
                          <span className="text-[#C9A84C] font-semibold shrink-0">{pt.name}:</span>
                          <span className="text-white/55">{pt.theyWillLove}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {jadeTip && (
            <div
              className="rounded-2xl p-5 mb-6"
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}
            >
              <p className="text-[10px] font-bold text-[#C9A84C] uppercase tracking-wider mb-2">
                Jade&apos;s tip
              </p>
              <p className="text-white/65 text-sm">{jadeTip}</p>
            </div>
          )}

          <a
            href="https://wa.me/447398753797"
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm bg-green-500 text-white hover:bg-green-600 transition-colors"
          >
            📱 WhatsApp Walz Travels to Book
          </a>
        </div>
      </div>
    )
  }

  // ── SUBMITTED / WAITING ────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <p className="text-5xl mb-6">{allIn ? '🎉' : '✅'}</p>

          <h1 className="text-white font-bold text-2xl mb-2">
            {allIn ? 'All preferences collected!' : 'You\'re in!'}
          </h1>

          {info && !allIn && (
            <p className="text-white/50 text-sm mb-6">
              Waiting for {remaining} more {remaining === 1 ? 'traveller' : 'travellers'} to share their preferences.
            </p>
          )}

          {info && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-white/35 mb-2">
                <span>{info.submittedCount} of {info.memberCount} submitted</span>
                <span>{percent}%</span>
              </div>
              <div className="w-full rounded-full h-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${percent}%`, background: '#C9A84C' }}
                />
              </div>
            </div>
          )}

          {allIn ? (
            <div className="space-y-3">
              <button
                onClick={handleAnalyse}
                disabled={analysing}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                style={{ background: '#C9A84C', color: '#0B1F3A' }}
              >
                {analysing
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Jade is thinking…</>
                  : <>✨ Generate Destination Recommendations</>}
              </button>
              {analyseError && <p className="text-red-400 text-sm">{analyseError}</p>}
            </div>
          ) : (
            <div>
              <button
                onClick={fetchInfo}
                className="text-[#C9A84C] text-sm font-medium hover:underline"
              >
                Refresh status
              </button>
              <p className="text-white/25 text-xs mt-2">Auto-refreshes every 30 seconds</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── PREFERENCE FORM ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0B1F3A] py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <p className="text-[#C9A84C] text-[10px] font-bold tracking-[0.28em] uppercase mb-3">
            Group Itinerary Hive
          </p>
          <h1 className="text-white font-bold text-2xl mb-1">{info?.tripName ?? 'Group Trip'}</h1>
          {info && (
            <p className="text-white/40 text-sm">
              {info.submittedCount} of {info.memberCount} travellers submitted
            </p>
          )}
        </div>

        {info && (
          <div className="mb-6">
            <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${percent}%`, background: '#C9A84C' }}
              />
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 space-y-6"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.2)' }}
        >
          {/* Name */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-2 text-[#C9A84C]">
              Your name *
            </label>
            <input
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="First name or nickname"
              className="w-full bg-transparent text-white text-sm outline-none py-2 placeholder-white/20"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}
              onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(201,168,76,0.65)' }}
              onBlur={e  => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.15)' }}
            />
          </div>

          {/* Dream destinations */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-2 text-[#C9A84C]">
              Dream destinations
            </label>
            <input
              value={form.destinations}
              onChange={e => set('destinations', e.target.value)}
              placeholder="e.g. Bali, Japan, anywhere warm..."
              className="w-full bg-transparent text-white text-sm outline-none py-2 placeholder-white/20"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}
              onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(201,168,76,0.65)' }}
              onBlur={e  => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.15)' }}
            />
          </div>

          {/* Travel style */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-3 text-[#C9A84C]">
              Travel style
            </label>
            <div className="flex flex-wrap gap-2">
              {TRAVEL_STYLES.map(style => (
                <button
                  key={style}
                  type="button"
                  onClick={() => set('travelStyle', form.travelStyle === style ? '' : style)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={form.travelStyle === style
                    ? { background: '#C9A84C', color: '#0B1F3A' }
                    : { border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.45)' }
                  }
                >{style}</button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-3 text-[#C9A84C]">
              Budget per person
            </label>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set('budget', form.budget === b ? '' : b)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={form.budget === b
                    ? { background: '#C9A84C', color: '#0B1F3A' }
                    : { border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.45)' }
                  }
                >{b}</button>
              ))}
            </div>
          </div>

          {/* Must-haves */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-2 text-[#C9A84C]">
              Must-haves
            </label>
            <input
              value={form.mustHaves}
              onChange={e => set('mustHaves', e.target.value)}
              placeholder="e.g. beach, halal food, no long-haul, pool..."
              className="w-full bg-transparent text-white text-sm outline-none py-2 placeholder-white/20"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}
              onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(201,168,76,0.65)' }}
              onBlur={e  => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.15)' }}
            />
          </div>

          {/* Dates */}
          <div>
            <label className="block text-[9px] font-bold tracking-[0.26em] uppercase mb-2 text-[#C9A84C]">
              Available dates / duration
            </label>
            <input
              value={form.dates}
              onChange={e => set('dates', e.target.value)}
              placeholder="e.g. August 2026, 7–10 days, anytime after June..."
              className="w-full bg-transparent text-white text-sm outline-none py-2 placeholder-white/20"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}
              onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(201,168,76,0.65)' }}
              onBlur={e  => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.15)' }}
            />
          </div>

          {error && (
            <div
              className="p-3 rounded-xl text-sm text-red-400"
              style={{ background: 'rgba(239,68,68,0.1)' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !form.name.trim()}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#C9A84C', color: '#0B1F3A' }}
          >
            {submitting ? 'Submitting…' : 'Submit My Preferences →'}
          </button>

          <p className="text-center text-xs text-white/25">
            🔒 Your preferences are private until Jade reveals the group result
          </p>
        </form>
      </div>
    </div>
  )
}
